import nodemailer from 'nodemailer'
import { getSupabaseServer } from '@/lib/supabase-server'

interface EmailOptions {
	to: string
	subject: string
	html: string
	attachments?: Array<{
		filename: string
		content: Buffer | string
		contentType?: string
	}>
	cc?: string[]
	bcc?: string[]
}

interface SmtpConfig {
	smtp_host: string
	smtp_port: number
	smtp_secure: boolean
	smtp_user: string
	smtp_password_encrypted: string
	sender_email: string
	sender_name: string
	default_cc_emails?: string[]
}

/**
 * Get SMTP configuration from database or environment
 */
export async function getSmtpConfig(institutionCode?: string): Promise<SmtpConfig | null> {
	// First try to get from database
	const supabase = getSupabaseServer()

	if (institutionCode) {
		const { data } = await supabase
			.from('smtp_configuration')
			.select('*')
			.eq('institution_code', institutionCode)
			.eq('is_active', true)
			.single()

		if (data) {
			return data
		}
	}

	// Fallback to environment variables
	if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD) {
		return {
			smtp_host: process.env.SMTP_HOST,
			smtp_port: parseInt(process.env.SMTP_PORT || '587'),
			smtp_secure: process.env.SMTP_SECURE === 'true',
			smtp_user: process.env.SMTP_USER,
			smtp_password_encrypted: process.env.SMTP_PASSWORD,
			sender_email: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER,
			sender_name: process.env.SMTP_FROM_NAME || 'Controller of Examinations',
		}
	}

	return null
}

/**
 * Create nodemailer transporter
 */
function createTransporter(config: SmtpConfig) {
	return nodemailer.createTransport({
		host: config.smtp_host,
		port: config.smtp_port,
		secure: config.smtp_secure,
		auth: {
			user: config.smtp_user,
			pass: config.smtp_password_encrypted, // In production, decrypt this
		},
	})
}

/**
 * Send email
 */
export async function sendEmail(options: EmailOptions, institutionCode?: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
	try {
		const config = await getSmtpConfig(institutionCode)

		if (!config) {
			return { success: false, error: 'SMTP configuration not found' }
		}

		const transporter = createTransporter(config)

		const mailOptions = {
			from: `"${config.sender_name}" <${config.sender_email}>`,
			to: options.to,
			cc: options.cc || config.default_cc_emails,
			bcc: options.bcc,
			subject: options.subject,
			html: options.html,
			attachments: options.attachments,
		}

		const info = await transporter.sendMail(mailOptions)

		return { success: true, messageId: info.messageId }
	} catch (error) {
		console.error('Email send error:', error)
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Failed to send email',
		}
	}
}

/**
 * Send bulk emails with BCC (examiners don't see each other's emails)
 */
export async function sendBulkEmail(
	recipients: string[],
	subject: string,
	htmlTemplate: string,
	attachments?: Array<{ filename: string; content: Buffer | string; contentType?: string }>,
	institutionCode?: string
): Promise<{ success: boolean; sent: number; failed: number; errors: Array<{ email: string; error: string }> }> {
	const errors: Array<{ email: string; error: string }> = []
	let sent = 0

	// Send individual emails (not BCC) so each person gets personalized content if needed
	for (const recipient of recipients) {
		const result = await sendEmail(
			{
				to: recipient,
				subject,
				html: htmlTemplate,
				attachments,
			},
			institutionCode
		)

		if (result.success) {
			sent++
		} else {
			errors.push({ email: recipient, error: result.error || 'Unknown error' })
		}
	}

	return {
		success: errors.length === 0,
		sent,
		failed: errors.length,
		errors,
	}
}

/**
 * Replace placeholders in template
 */
export function replacePlaceholders(template: string, data: Record<string, string>): string {
	let result = template
	for (const [key, value] of Object.entries(data)) {
		result = result.replace(new RegExp(`{{${key}}}`, 'g'), value)
	}
	return result
}

/**
 * Get email template from database
 */
export async function getEmailTemplate(templateCode: string, institutionCode?: string): Promise<{ subject: string; body: string } | null> {
	const supabase = getSupabaseServer()

	let query = supabase
		.from('examiner_email_templates')
		.select('subject_template, body_template')
		.eq('template_code', templateCode)
		.eq('is_active', true)

	if (institutionCode) {
		query = query.eq('institution_code', institutionCode)
	} else {
		query = query.is('institution_code', null)
	}

	const { data } = await query.single()

	if (data) {
		return {
			subject: data.subject_template,
			body: data.body_template,
		}
	}

	// Fallback to default template (no institution_code)
	const { data: defaultTemplate } = await supabase
		.from('examiner_email_templates')
		.select('subject_template, body_template')
		.eq('template_code', templateCode)
		.eq('is_active', true)
		.eq('is_default', true)
		.single()

	if (defaultTemplate) {
		return {
			subject: defaultTemplate.subject_template,
			body: defaultTemplate.body_template,
		}
	}

	return null
}

/**
 * Log email to database
 */
export async function logEmail(
	examinerId: string,
	emailTo: string,
	subject: string,
	body: string,
	status: 'PENDING' | 'SENT' | 'FAILED',
	options?: {
		boardId?: string
		boardType?: string
		pdfUrl?: string
		errorMessage?: string
		appointmentId?: string
		institutionCode?: string
		createdBy?: string
	}
): Promise<void> {
	const supabase = getSupabaseServer()

	await supabase.from('examiner_email_logs').insert({
		examiner_id: examinerId,
		email_to: emailTo,
		email_subject: subject,
		email_body: body,
		status,
		board_id: options?.boardId,
		board_type: options?.boardType,
		pdf_url: options?.pdfUrl,
		error_message: options?.errorMessage,
		appointment_id: options?.appointmentId,
		institution_code: options?.institutionCode,
		created_by: options?.createdBy,
		sent_at: status === 'SENT' ? new Date().toISOString() : null,
	})
}
