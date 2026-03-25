import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { generateAppointmentPdf } from '@/lib/pdf/practical-appointment-letter'
import { sendEmail, replacePlaceholders, getEmailTemplate } from '@/lib/services/email-service'
import { getPdfSettingsWithFallback } from '@/lib/pdf/settings-service'
import type { AppointmentLetterData } from '@/types/practical-email'

// ---------------------------------------------------------------------------
// POST — Resend failed practical appointment emails
// Body: { email_log_ids: string[], institution_code: string }
// Returns: { resent: number, failed: number }
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
	try {
		const body = await request.json()
		const { email_log_ids, institution_code } = body

		if (!Array.isArray(email_log_ids) || email_log_ids.length === 0) {
			return NextResponse.json({ error: 'email_log_ids must be a non-empty array' }, { status: 400 })
		}
		if (!institution_code?.trim()) {
			return NextResponse.json({ error: 'institution_code is required' }, { status: 400 })
		}

		const supabase = getSupabaseServer()

		// Fetch the log records to resend
		const { data: logs, error: logsError } = await supabase
			.from('examiner_email_logs')
			.select(
				'id, examiner_id, email_to, email_subject, email_body, status, examiner_type, practical_batch_id, institution_code'
			)
			.in('id', email_log_ids)

		if (logsError) {
			console.error('Error fetching email logs for resend:', logsError)
			return NextResponse.json({ error: 'Failed to fetch email logs' }, { status: 500 })
		}

		if (!logs || logs.length === 0) {
			return NextResponse.json({ error: 'No email log records found for the provided IDs' }, { status: 404 })
		}

		// Resolve institution details once (use institution_code from body)
		const { data: institution } = await supabase
			.from('institutions')
			.select('id, institution_code, name')
			.eq('institution_code', institution_code)
			.single()

		const institutionsId = institution?.id || ''

		// Fetch full PDF settings (all visual settings + institution details)
		const pdfSettings = await getPdfSettingsWithFallback(institution_code, 'report')

		// Institution details from pdf_institution_settings with hardcoded fallbacks
		const institutionName = (pdfSettings as any)?.institution_name || institution?.name || 'J.K.K. NATARAJA COLLEGE OF ARTS & SCIENCE'
		const institutionAddress = (pdfSettings as any)?.institution_address || 'Komarapalayam- 638 183, Namakkal District, Tamil Nadu'
		const institutionAccreditation = '(Accredited by NAAC, Approved by AICTE, Recognized by UGC Under Section 2(f) & 12(B), Affiliated to Periyar University)'

		// COE details from pdf_institution_settings
		const coeName = (pdfSettings as any)?.coe_name || 'Controller of Examinations'
		const coeQualifications = (pdfSettings as any)?.coe_qualifications || ''
		const coeContact = (pdfSettings as any)?.coe_contact || ''
		const coeEmail = process.env.COE_EMAIL || 'coearts@jkkn.ac.in'

		const emailTemplate = await getEmailTemplate('PRACTICAL_APPOINTMENT', institution_code)

		let resent = 0
		let failed = 0

		for (const log of logs) {
			try {
				const examinerType = (log.examiner_type || 'external') as 'internal' | 'external' | 'skilled' | 'programmer'
				const emailTo = log.email_to

				if (!emailTo) {
					failed++
					await markLogResendFailed(supabase, log.id, 'No email address on log record')
					continue
				}

				// Determine examiner role text
				const examinerRole =
					examinerType === 'internal'
						? 'an Internal Examiner'
						: examinerType === 'external'
							? 'an External Examiner'
							: examinerType === 'programmer'
								? 'a Programmer'
								: 'a Skilled Examiner'

				// Re-fetch examiner details and assignments
				let examinerName = ''
				let examinerDesignation = ''
				let examinerInstitution = ''
				let examinerAddress = ''
				let examinerIdentifier = ''
				let examinationSessionId = ''
				let examSessionName = ''

				// Resolve session from batch if available
				if (log.practical_batch_id) {
					const { data: batch } = await supabase
						.from('practical_email_batches')
						.select('examination_session_id')
						.eq('id', log.practical_batch_id)
						.single()

					if (batch?.examination_session_id) {
						examinationSessionId = batch.examination_session_id

						const { data: sessionRow } = await supabase
							.from('examination_sessions')
							.select('session_name')
							.eq('id', examinationSessionId)
							.single()

						examSessionName = sessionRow?.session_name || ''
					}
				}

				if (examinerType === 'external' && log.examiner_id) {
					// Re-fetch external examiner details
					const { data: examiner } = await supabase
						.from('examiners')
						.select('id, full_name, email, designation, institution_name, institution_address, address, city, state')
						.eq('id', log.examiner_id)
						.single()

					if (!examiner) {
						failed++
						await markLogResendFailed(supabase, log.id, 'External examiner record no longer exists')
						continue
					}

					examinerName = examiner.full_name || ''
					examinerDesignation = examiner.designation || ''
					examinerInstitution = examiner.institution_name || ''
					examinerAddress = [examiner.institution_address || examiner.address, examiner.city, examiner.state]
						.filter(Boolean)
						.join(', ')
					examinerIdentifier = examiner.id
				} else {
					// Internal / skilled: resolve via email address from log + examiner_type
					// Look up the exam_timetable_examiners row by matching email
					const { data: assignment } = await supabase
						.from('exam_timetable_examiners')
						.select('staff_id, staff_name, staff_email')
						.eq('staff_email', emailTo)
						.eq('examiner_type', examinerType)
						.limit(1)
						.maybeSingle()

					if (assignment) {
						examinerName = assignment.staff_name || ''
						examinerIdentifier = assignment.staff_id || ''
					} else {
						// Fallback: use email as name placeholder
						examinerName = emailTo
						examinerIdentifier = emailTo
					}

					// Use local institution name (sentence case) for internal/skilled examiners
					examinerInstitution = institution?.name || institutionName
					examinerAddress = institutionAddress
				}

				// Re-fetch course assignments
				const courses = examinerIdentifier && examinationSessionId && institutionsId
					? await fetchExaminerCourses(
							supabase,
							examinerType,
							examinerIdentifier,
							institutionsId,
							examinationSessionId
						)
					: []

				// Build ref number: JKKN{code}/ CoE/ YY-YY, {session months}/Sem Practicals
				const refNumber = buildPracticalRefNumber(institution_code, examSessionName)
				const letterDate = new Date().toLocaleDateString('en-IN', {
					day: '2-digit',
					month: 'long',
					year: 'numeric',
				})

				const appointmentData: AppointmentLetterData = {
					institution_name: institutionName,
					institution_address: institutionAddress,
					institution_accreditation: institutionAccreditation,
					coe_name: coeName,
					coe_qualifications: coeQualifications,
					coe_contact: coeContact,
					coe_email: coeEmail,
					header_image_url: pdfSettings?.logo_url || null,
					coe_signature_url: (pdfSettings as any)?.coe_signature_url || null,
					coe_seal_url: (pdfSettings as any)?.coe_seal_url || null,
					ref_number: refNumber,
					letter_date: letterDate,
					exam_session_name: examSessionName,
					examiner_name: examinerName,
					examiner_designation: examinerDesignation,
					examiner_institution: examinerInstitution,
					examiner_address: examinerAddress,
					examiner_type: examinerType,
					examiner_role: examinerRole,
					courses: courses.map((c) => ({
						date: c.exam_date,
						session: c.session,
						programme: c.programme,
						course_code: c.course_code,
						course_name: c.course_name,
						student_count: c.student_count,
					})),
					pdf_settings: pdfSettings,
				}

				// Regenerate PDF
				let pdfBuffer: Buffer
				try {
					pdfBuffer = await generateAppointmentPdf(appointmentData)
				} catch (pdfErr) {
					console.error(`PDF regeneration failed for log ${log.id}:`, pdfErr)
					failed++
					await markLogResendFailed(
						supabase,
						log.id,
						pdfErr instanceof Error ? pdfErr.message : 'PDF generation failed'
					)
					continue
				}

				// Build email subject and body
				let emailSubject = `Appointment Letter - Practical Examiner - ${examSessionName}`
				let emailBody = `
<p>Dear Sir/Madam,</p>
<p>Greetings from ${institutionName} </p>
<p>Please find attached the practical examination appointment order for your reference.</p>
<p>If you are not in a position to accept this offer, please inform us through mail at <a href="mailto:${coeEmail}">${coeEmail}</a> immediately.</p>
<br/>
<p>Warm Regards,<br/>
${coeName}${coeQualifications ? ', ' + coeQualifications : ''},<br/>
Controller of Examinations,<br/>
${institutionName} ,<br/>
${institutionAddress},<br/>
Email: ${coeEmail}${coeContact ? ',<br/>Contact: ' + coeContact + '.' : '.'}</p>`

				if (emailTemplate) {
					const placeholders: Record<string, string> = {
						examiner_name: examinerName,
						examiner_designation: examinerDesignation,
						examiner_role: examinerRole,
						exam_session: examSessionName,
						institution_name: institutionName,
						institution_address: institutionAddress,
						coe_name: coeQualifications ? `${coeName}, ${coeQualifications}` : coeName,
						coe_email: coeEmail,
						coe_contact: coeContact,
					}
					emailSubject = replacePlaceholders(emailTemplate.subject, placeholders)
					emailBody = replacePlaceholders(emailTemplate.body, placeholders)
				}

				// Re-send
				const sendResult = await sendEmail(
					{
						to: emailTo,
						subject: emailSubject,
						html: emailBody,
						attachments: [
							{
								filename: `Appointment_Letter_${examinerName.replace(/\s+/g, '_')}.pdf`,
								content: pdfBuffer,
								contentType: 'application/pdf',
							},
						],
					},
					institution_code
				)

				// Update the log record with the result
				if (sendResult.success) {
					resent++
					await supabase
						.from('examiner_email_logs')
						.update({
							status: 'SENT',
							email_subject: emailSubject,
							email_body: emailBody,
							sent_at: new Date().toISOString(),
							error_message: null,
							retry_count: (await getRetryCount(supabase, log.id)) + 1,
						})
						.eq('id', log.id)
				} else {
					failed++
					await markLogResendFailed(supabase, log.id, sendResult.error || 'Send failed')
				}
			} catch (logErr) {
				console.error(`Unhandled error resending log ${log.id}:`, logErr)
				failed++
				await markLogResendFailed(
					supabase,
					log.id,
					logErr instanceof Error ? logErr.message : 'Unexpected error during resend'
				)
			}
		}

		return NextResponse.json({ resent, failed })
	} catch (error) {
		console.error('Unexpected error in POST /api/pre-exam/practical-email/resend:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Mark a log record as FAILED with an error message and increment retry count.
 */
async function markLogResendFailed(
	supabase: ReturnType<typeof getSupabaseServer>,
	logId: string,
	errorMessage: string
): Promise<void> {
	try {
		const currentRetry = await getRetryCount(supabase, logId)
		await supabase
			.from('examiner_email_logs')
			.update({
				status: 'FAILED',
				error_message: errorMessage,
				retry_count: currentRetry + 1,
			})
			.eq('id', logId)
	} catch (err) {
		console.error('Failed to mark log as failed:', err)
	}
}

/**
 * Get current retry_count for a log record.
 */
async function getRetryCount(
	supabase: ReturnType<typeof getSupabaseServer>,
	logId: string
): Promise<number> {
	const { data } = await supabase
		.from('examiner_email_logs')
		.select('retry_count')
		.eq('id', logId)
		.single()
	return (data as any)?.retry_count ?? 0
}

/**
 * Fetch all practical exam timetable rows assigned to a given examiner.
 * Shared logic with the send route.
 */
async function fetchExaminerCourses(
	supabase: ReturnType<typeof getSupabaseServer>,
	examinerType: 'internal' | 'external' | 'skilled' | 'programmer',
	examinerIdentifier: string,
	institutionsId: string,
	examinationSessionId: string
): Promise<
	Array<{
		timetable_id: string
		exam_date: string
		session: string
		programme: string
		course_code: string
		course_name: string
		student_count: number
		batch_no: number
	}>
> {
	let assignmentQuery = supabase
		.from('exam_timetable_examiners')
		.select('exam_timetable_id')
		.eq('examiner_type', examinerType)

	if (examinerType === 'external') {
		assignmentQuery = assignmentQuery.eq('examiner_id', examinerIdentifier)
	} else {
		assignmentQuery = assignmentQuery.eq('staff_id', examinerIdentifier)
	}

	const { data: assignments } = await assignmentQuery

	if (!assignments || assignments.length === 0) return []

	const timetableIds = assignments.map((a) => a.exam_timetable_id)

	const { data: timetables } = await supabase
		.from('exam_timetables')
		.select('id, exam_date, session, course_id')
		.in('id', timetableIds)
		.eq('institutions_id', institutionsId)
		.eq('examination_session_id', examinationSessionId)
		.eq('is_published', true)

	if (!timetables || timetables.length === 0) return []

	const courseIds = [...new Set(timetables.map((t) => t.course_id).filter(Boolean))]

	const { data: courses } = await supabase
		.from('courses')
		.select('id, course_code, course_name, board_code')
		.in('id', courseIds)

	const courseMap = new Map<string, { course_code: string; course_name: string; board_code: string }>()
	for (const c of courses || []) {
		courseMap.set(c.id, c)
	}

	const boardCodes = [...new Set((courses || []).map((c) => c.board_code).filter(Boolean))]
	const boardMap = new Map<string, string>()
	if (boardCodes.length > 0) {
		const { data: boards } = await supabase
			.from('board')
			.select('board_code, board_name')
			.in('board_code', boardCodes)

		for (const b of boards || []) {
			boardMap.set(b.board_code, b.board_name || b.board_code)
		}
	}

	const { data: batchStudents } = await supabase
		.from('practical_batch_students')
		.select('exam_timetable_id')
		.in('exam_timetable_id', timetableIds)

	const studentCountMap = new Map<string, number>()
	for (const s of batchStudents || []) {
		studentCountMap.set(s.exam_timetable_id, (studentCountMap.get(s.exam_timetable_id) || 0) + 1)
	}

	const sorted = [...timetables].sort((a, b) => {
		if (a.exam_date !== b.exam_date) return a.exam_date < b.exam_date ? -1 : 1
		return a.session === 'FN' ? -1 : 1
	})

	const batchCounters = new Map<string, number>()
	return sorted.map((t) => {
		const course = courseMap.get(t.course_id) || { course_code: '', course_name: '', board_code: '' }
		const batchNum = (batchCounters.get(t.course_id) || 0) + 1
		batchCounters.set(t.course_id, batchNum)

		return {
			timetable_id: t.id,
			exam_date: t.exam_date,
			session: t.session,
			programme: boardMap.get(course.board_code) || course.board_code || '',
			course_code: course.course_code,
			course_name: course.course_name,
			student_count: studentCountMap.get(t.id) || 0,
			batch_no: batchNum,
		}
	})
}

/**
 * Build practical appointment ref number.
 * Format: JKKN{code}/ CoE/ YY-YY, {session months}/Sem Practicals
 */
function buildPracticalRefNumber(institutionCode: string, examSessionName: string): string {
	const yearMatch = examSessionName.match(/\d{4}/)
	const year = yearMatch ? parseInt(yearMatch[0]) : new Date().getFullYear()
	const academicYear = `${String(year - 1).slice(-2)}-${String(year).slice(-2)}`

	const sessionMonths = examSessionName
		.replace(/[-\s]*\d{4}/, '')
		.trim()
		.split(/[-\s]+/)
		.filter(Boolean)
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
		.join('-')

	return `JKKN${institutionCode}/ CoE/ ${academicYear}, ${sessionMonths}/Sem Practicals`
}
