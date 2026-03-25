import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { sendEmail, replacePlaceholders, getEmailTemplate, logEmail } from '@/lib/services/email-service'
import { generateAppointmentLetterPdf } from '@/lib/services/appointment-pdf-service'

interface SendAppointmentRequest {
	examiner_ids: string[]
	appointment_type: string
	board_id?: string
	appointment_date: string
	reporting_time: string
	venue: string
	subject_name?: string
	exam_name?: string
	custom_message?: string
	institution_code?: string
}

export async function POST(request: Request) {
	try {
		const body: SendAppointmentRequest = await request.json()
		const supabase = getSupabaseServer()

		// Validate request
		if (!body.examiner_ids || body.examiner_ids.length === 0) {
			return NextResponse.json({ error: 'No examiners selected' }, { status: 400 })
		}

		if (!body.appointment_type) {
			return NextResponse.json({ error: 'Appointment type is required' }, { status: 400 })
		}

		if (!body.appointment_date) {
			return NextResponse.json({ error: 'Appointment date is required' }, { status: 400 })
		}

		// Fetch examiners
		const { data: examiners, error: fetchError } = await supabase
			.from('examiners')
			.select('*')
			.in('id', body.examiner_ids)
			.eq('status', 'ACTIVE')

		if (fetchError || !examiners || examiners.length === 0) {
			return NextResponse.json({ error: 'No active examiners found' }, { status: 400 })
		}

		// Fetch board info if provided
		let boardName = ''
		if (body.board_id) {
			const { data: board } = await supabase
				.from('board')
				.select('board_name')
				.eq('id', body.board_id)
				.single()
			boardName = board?.board_name || ''
		}

		// Fetch institution info
		let institutionName = 'J.K.K. Nataraja College of Arts & Science'
		if (body.institution_code) {
			const { data: institution } = await supabase
				.from('institutions')
				.select('name')
				.eq('institution_code', body.institution_code)
				.single()
			if (institution) {
				institutionName = institution.name
			}
		}

		// Get email template
		const templateCode = `${body.appointment_type}_APPOINTMENT`
		const template = await getEmailTemplate(templateCode, body.institution_code)

		if (!template) {
			return NextResponse.json({ error: 'Email template not found' }, { status: 400 })
		}

		// Track results
		const results = {
			sent: 0,
			failed: 0,
			errors: [] as Array<{ examiner_id: string; email: string; error: string }>,
		}

		// Send emails to each examiner
		for (const examiner of examiners) {
			try {
				// Generate personalized PDF
				let pdfBuffer: Buffer | null = null
				let pdfUrl: string | null = null

				try {
					pdfBuffer = await generateAppointmentLetterPdf({
						examinerName: examiner.full_name,
						examinerDesignation: examiner.designation || '',
						examinerInstitution: examiner.institution_name || '',
						boardName,
						examName: body.exam_name || 'Examination',
						appointmentType: body.appointment_type,
						appointmentDate: body.appointment_date,
						reportingTime: body.reporting_time,
						venue: body.venue,
						subjectName: body.subject_name || '',
						institutionName,
						institutionCode: body.institution_code || '',
					})
				} catch (pdfError) {
					console.error('PDF generation error:', pdfError)
					// Continue without PDF
				}

				// Prepare template data
				const templateData: Record<string, string> = {
					examiner_name: examiner.full_name,
					board_name: boardName,
					exam_name: body.exam_name || 'Examination',
					appointment_date: new Date(body.appointment_date).toLocaleDateString('en-IN', {
						weekday: 'long',
						year: 'numeric',
						month: 'long',
						day: 'numeric',
					}),
					reporting_time: body.reporting_time,
					venue: body.venue,
					subject_name: body.subject_name || '',
					institution_name: institutionName,
					custom_message: body.custom_message || '',
				}

				// Replace placeholders
				const subject = replacePlaceholders(template.subject, templateData)
				const htmlBody = replacePlaceholders(template.body, templateData)

				// Prepare attachments
				const attachments = pdfBuffer
					? [
							{
								filename: `Appointment_Letter_${examiner.full_name.replace(/\s+/g, '_')}.pdf`,
								content: pdfBuffer,
								contentType: 'application/pdf',
							},
					  ]
					: []

				// Send email
				const emailResult = await sendEmail(
					{
						to: examiner.email,
						subject,
						html: htmlBody,
						attachments,
					},
					body.institution_code
				)

				// Create appointment record
				const { data: appointment } = await supabase
					.from('examiner_appointments')
					.insert({
						examiner_id: examiner.id,
						institution_code: body.institution_code || '',
						board_id: body.board_id,
						appointment_type: body.appointment_type,
						appointment_date: body.appointment_date,
						reporting_time: body.reporting_time,
						venue: body.venue,
						subject_name: body.subject_name,
						status: 'APPOINTED',
					})
					.select()
					.single()

				// Log email
				await logEmail(
					examiner.id,
					examiner.email,
					subject,
					htmlBody,
					emailResult.success ? 'SENT' : 'FAILED',
					{
						boardId: body.board_id,
						boardType: body.appointment_type,
						pdfUrl,
						errorMessage: emailResult.error,
						appointmentId: appointment?.id,
						institutionCode: body.institution_code,
					}
				)

				if (emailResult.success) {
					results.sent++
				} else {
					results.failed++
					results.errors.push({
						examiner_id: examiner.id,
						email: examiner.email,
						error: emailResult.error || 'Failed to send',
					})
				}
			} catch (error) {
				results.failed++
				results.errors.push({
					examiner_id: examiner.id,
					email: examiner.email,
					error: error instanceof Error ? error.message : 'Unknown error',
				})
			}
		}

		return NextResponse.json({
			success: results.failed === 0,
			sent_count: results.sent,
			failed_count: results.failed,
			errors: results.errors,
		})
	} catch (e) {
		console.error('Send appointment error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
