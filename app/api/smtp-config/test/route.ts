import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import nodemailer from 'nodemailer'

/**
 * POST /api/smtp-config/test
 * Test SMTP configuration by sending a test email
 */
export async function POST(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()

		const { config_id, test_email } = body

		if (!config_id || !test_email) {
			return NextResponse.json({
				error: 'Missing required fields: config_id, test_email'
			}, { status: 400 })
		}

		// Fetch SMTP configuration
		const { data: config, error: fetchError } = await supabase
			.from('smtp_configuration')
			.select('*')
			.eq('id', config_id)
			.single()

		if (fetchError || !config) {
			return NextResponse.json({
				error: 'SMTP configuration not found'
			}, { status: 404 })
		}

		// Create transporter
		const transporter = nodemailer.createTransport({
			host: config.smtp_host,
			port: config.smtp_port,
			secure: config.smtp_secure,
			auth: {
				user: config.smtp_user,
				pass: config.smtp_password_encrypted // In production, decrypt this
			}
		})

		// Verify connection
		try {
			await transporter.verify()
		} catch (verifyError) {
			console.error('SMTP verification failed:', verifyError)
			return NextResponse.json({
				success: false,
				error: 'SMTP connection failed. Please check your credentials.',
				details: verifyError instanceof Error ? verifyError.message : 'Unknown error'
			}, { status: 400 })
		}

		// Send test email
		const testMessage = {
			from: `"${config.sender_name}" <${config.sender_email}>`,
			to: test_email,
			subject: 'SMTP Configuration Test - JKKN COE',
			html: `
				<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
					<div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
						<h1 style="color: white; margin: 0;">JKKN COE</h1>
						<p style="color: #e0e0e0; margin: 5px 0 0 0;">Controller of Examinations</p>
					</div>
					<div style="padding: 30px; background: #f9fafb;">
						<h2 style="color: #1f2937; margin-top: 0;">SMTP Test Successful!</h2>
						<p style="color: #4b5563;">This is a test email to verify your SMTP configuration.</p>
						<div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
							<h3 style="color: #374151; margin-top: 0;">Configuration Details:</h3>
							<ul style="color: #6b7280; padding-left: 20px;">
								<li><strong>Host:</strong> ${config.smtp_host}</li>
								<li><strong>Port:</strong> ${config.smtp_port}</li>
								<li><strong>Secure:</strong> ${config.smtp_secure ? 'Yes (TLS)' : 'No'}</li>
								<li><strong>Sender:</strong> ${config.sender_email}</li>
							</ul>
						</div>
						<p style="color: #6b7280; font-size: 14px;">
							If you received this email, your SMTP configuration is working correctly.
						</p>
					</div>
					<div style="background: #1f2937; padding: 15px; text-align: center;">
						<p style="color: #9ca3af; margin: 0; font-size: 12px;">
							This is an automated test email from JKKN COE System.
						</p>
					</div>
				</div>
			`
		}

		try {
			const info = await transporter.sendMail(testMessage)
			console.log('Test email sent:', info.messageId)

			return NextResponse.json({
				success: true,
				message: `Test email sent successfully to ${test_email}`,
				messageId: info.messageId
			})
		} catch (sendError) {
			console.error('Failed to send test email:', sendError)
			return NextResponse.json({
				success: false,
				error: 'Failed to send test email',
				details: sendError instanceof Error ? sendError.message : 'Unknown error'
			}, { status: 500 })
		}
	} catch (error) {
		console.error('SMTP test error:', error)
		return NextResponse.json({
			error: 'Failed to test SMTP configuration'
		}, { status: 500 })
	}
}
