import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { generateAppointmentPdf } from '@/lib/pdf/practical-appointment-letter'
import { sendEmail, replacePlaceholders, getEmailTemplate, logEmail } from '@/lib/services/email-service'
import { getPdfSettingsWithFallback } from '@/lib/pdf/settings-service'
import type { AppointmentLetterData } from '@/types/practical-email'
import { fetchMyJKKNStaffById } from '@/services/myjkkn-service'

// Vercel serverless timeout — allow up to 60s for PDF generation + email sending
export const maxDuration = 60

// ---------------------------------------------------------------------------
// POST — Send practical appointment emails
// Body: { institutions_id, institution_code, examination_session_id, examiner_keys }
// Processes synchronously (Vercel kills background tasks after response is sent)
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
	try {
		const body = await request.json()
		const { institutions_id, examination_session_id } = body
		let { institution_code, examiner_keys } = body

		// Validate required fields
		if (!institutions_id?.trim()) {
			return NextResponse.json({ error: 'institutions_id is required' }, { status: 400 })
		}
		if (!examination_session_id?.trim()) {
			return NextResponse.json({ error: 'examination_session_id is required' }, { status: 400 })
		}
		if (!Array.isArray(examiner_keys) || examiner_keys.length === 0) {
			return NextResponse.json({ error: 'examiner_keys must be a non-empty array' }, { status: 400 })
		}

		const supabase = getSupabaseServer()

		// Normalize examiner_keys: accept both string[] and {key, type}[] formats
		// Frontend sends [{key: "external_uuid", type: "external"}], API needs ["external_uuid"]
		examiner_keys = examiner_keys.map((k: string | { key: string }) =>
			typeof k === 'string' ? k : k.key
		)

		// Auto-resolve institution_code from institutions_id if not provided
		if (!institution_code?.trim()) {
			const { data: inst } = await supabase
				.from('institutions')
				.select('institution_code')
				.eq('id', institutions_id)
				.single()

			if (!inst?.institution_code) {
				return NextResponse.json({ error: 'Could not resolve institution_code' }, { status: 400 })
			}
			institution_code = inst.institution_code
		}

		// Create batch record with status='processing'
		const { data: batch, error: batchError } = await supabase
			.from('practical_email_batches')
			.insert({
				institutions_id: String(institutions_id),
				institution_code: String(institution_code),
				examination_session_id: String(examination_session_id),
				total_emails: examiner_keys.length,
				sent_count: 0,
				failed_count: 0,
				status: 'processing',
				started_at: new Date().toISOString(),
			})
			.select('id')
			.single()

		if (batchError || !batch) {
			console.error('Error creating email batch:', batchError)
			return NextResponse.json({ error: 'Failed to create email batch' }, { status: 500 })
		}

		// Process synchronously — Vercel kills background tasks after response is sent
		let processingError: string | null = null
		try {
			await processEmailBatch(
				batch.id,
				String(institutions_id),
				String(institution_code),
				String(examination_session_id),
				examiner_keys as string[]
			)
		} catch (err) {
			processingError = err instanceof Error ? err.message : 'Unknown processing error'
			console.error('processEmailBatch threw:', err)
		}

		// Fetch final batch status
		const { data: finalBatch } = await supabase
			.from('practical_email_batches')
			.select('sent_count, failed_count, status')
			.eq('id', batch.id)
			.single()

		return NextResponse.json(
			{
				batch_id: batch.id,
				total_emails: examiner_keys.length,
				sent_count: finalBatch?.sent_count || 0,
				failed_count: finalBatch?.failed_count || 0,
				status: finalBatch?.status || 'completed',
				error: processingError,
			},
			{ status: 200 }
		)
	} catch (error) {
		console.error('Unexpected error in POST /api/pre-exam/practical-email/send:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// ---------------------------------------------------------------------------
// Background processing
// ---------------------------------------------------------------------------

async function processEmailBatch(
	batchId: string,
	institutionsId: string,
	institutionCode: string,
	examinationSessionId: string,
	examinerKeys: string[]
): Promise<void> {
	const supabase = getSupabaseServer()
	let sentCount = 0
	let failedCount = 0

	try {
		// 1. Fetch institution basic info
		const { data: institution } = await supabase
			.from('institutions')
			.select('id, institution_code, name')
			.eq('id', institutionsId)
			.single()

		// 2. Fetch PDF settings (all visual settings + institution details)
		const pdfSettings = await getPdfSettingsWithFallback(institutionCode, 'report')

		// Institution details from pdf_institution_settings with hardcoded fallbacks
		const institutionName = (pdfSettings as any)?.institution_name || institution?.name || 'J.K.K. NATARAJA COLLEGE OF ARTS & SCIENCE'
		const institutionAddress = (pdfSettings as any)?.institution_address || 'Komarapalayam- 638 183, Namakkal District, Tamil Nadu'
		const institutionAccreditation = '(Accredited by NAAC, Approved by AICTE, Recognized by UGC Under Section 2(f) & 12(B), Affiliated to Periyar University)'

		// COE details from pdf_institution_settings
		const coeName = (pdfSettings as any)?.coe_name || 'Controller of Examinations'
		const coeQualifications = (pdfSettings as any)?.coe_qualifications || ''
		const coeContact = (pdfSettings as any)?.coe_contact || ''
		const coeEmail = process.env.COE_EMAIL || 'coearts@jkkn.ac.in'

		// 3. Fetch examination session name
		const { data: session } = await supabase
			.from('examination_sessions')
			.select('session_name')
			.eq('id', examinationSessionId)
			.single()

		const examSessionName = session?.session_name || ''

		// 4. Fetch email template
		const emailTemplate = await getEmailTemplate('PRACTICAL_APPOINTMENT', institutionCode)

		// 5. Process each examiner key
		for (const examinerKey of examinerKeys) {
			try {
				// Parse key: format is "<type>_<identifier>"
				// e.g. "external_<uuid>" or "internal_<staff_id>" or "skilled_<staff_id>"
				const underscoreIdx = examinerKey.indexOf('_')
				if (underscoreIdx === -1) {
					console.error(`Invalid examiner_key format: ${examinerKey}`)
					failedCount++
					await logBatchEmailFailure(supabase, batchId, examinerKey, 'Invalid examiner_key format', institutionCode)
					await updateBatchCounts(supabase, batchId, sentCount, failedCount)
					continue
				}

				const examinerType = examinerKey.substring(0, underscoreIdx) as 'internal' | 'external' | 'skilled' | 'programmer'
				const examinerIdentifier = examinerKey.substring(underscoreIdx + 1)

				if (!['internal', 'external', 'skilled', 'programmer'].includes(examinerType)) {
					console.error(`Unknown examiner type in key: ${examinerKey}`)
					failedCount++
					await logBatchEmailFailure(supabase, batchId, examinerKey, 'Unknown examiner type', institutionCode)
					await updateBatchCounts(supabase, batchId, sentCount, failedCount)
					continue
				}

				// Determine examiner role text for the letter
				const examinerRole =
					examinerType === 'internal'
						? 'an Internal Examiner'
						: examinerType === 'external'
							? 'an External Examiner'
							: examinerType === 'programmer'
								? 'a Programmer'
								: 'a Skilled Examiner'

				// Fetch examiner details and assigned courses
				let examinerName = ''
				let examinerEmail: string | null = null
				let examinerDesignation = ''
				let examinerDepartment = ''
				let examinerInstitution = ''
				let examinerAddress = ''
				let examinerMobile = ''
				let externalExaminerId: string | null = null

				if (examinerType === 'external') {
					// External: identifier is the examiners.id UUID
					const { data: examiner } = await supabase
						.from('examiners')
						.select('id, full_name, email, designation, department, mobile, institution_name, institution_address, address, city, state')
						.eq('id', examinerIdentifier)
						.single()

					if (!examiner) {
						console.error(`External examiner not found: ${examinerIdentifier}`)
						failedCount++
						await logBatchEmailFailure(supabase, batchId, examinerKey, 'Examiner record not found', institutionCode)
						await updateBatchCounts(supabase, batchId, sentCount, failedCount)
						continue
					}

					externalExaminerId = examiner.id
					examinerName = examiner.full_name || ''
					examinerEmail = examiner.email || null
					examinerDesignation = examiner.designation || ''
					examinerDepartment = examiner.department || ''
					examinerMobile = examiner.mobile || ''
					examinerInstitution = examiner.institution_name || ''
					examinerAddress = [examiner.institution_address || examiner.address, examiner.city, examiner.state]
						.filter(Boolean)
						.join(', ')
				} else {
					// Internal / Skilled / Programmer: identifier is staff_id from exam_timetable_examiners
					const { data: assignment } = await supabase
						.from('exam_timetable_examiners')
						.select('staff_name, staff_mobile, staff_designation')
						.eq('staff_id', examinerIdentifier)
						.eq('examiner_type', examinerType)
						.limit(1)
						.single()

					if (!assignment) {
						console.error(`${examinerType} examiner assignment not found for staff_id: ${examinerIdentifier}`)
						failedCount++
						await logBatchEmailFailure(supabase, batchId, examinerKey, 'Examiner assignment not found', institutionCode)
						await updateBatchCounts(supabase, batchId, sentCount, failedCount)
						continue
					}

					examinerName = assignment.staff_name || ''
					examinerDesignation = assignment.staff_designation || ''
					examinerMobile = assignment.staff_mobile || ''

					// Fetch email, designation & department from MyJKKN staff API
					try {
						const staffData = await fetchMyJKKNStaffById(examinerIdentifier)
						if (staffData) {
							examinerEmail = staffData.email || null
							if (!examinerDesignation && staffData.designation) {
								examinerDesignation = staffData.designation
							}
							if (staffData.department_code) {
								examinerDepartment = staffData.department_code
							}
						}
					} catch {
						console.warn(`Failed to fetch MyJKKN staff details for ${examinerIdentifier}`)
						examinerEmail = null
					}

					// Use local institution name for internal/skilled examiners
					examinerInstitution = institution?.name || institutionName
					examinerAddress = institutionAddress
				}

				if (!examinerEmail) {
					console.warn(`No email address for examiner key ${examinerKey}, skipping`)
					failedCount++
					await logBatchEmailFailure(supabase, batchId, examinerKey, 'No email address on record', institutionCode, {
						examinerName,
						examinerType,
					})
					await updateBatchCounts(supabase, batchId, sentCount, failedCount)
					continue
				}

				// Fetch assigned courses for this examiner in the session
				const courses = await fetchExaminerCourses(
					supabase,
					examinerType,
					examinerIdentifier,
					institutionsId,
					examinationSessionId
				)

				if (courses.length === 0) {
					console.warn(`No course assignments found for examiner key ${examinerKey}`)
					failedCount++
					await logBatchEmailFailure(
						supabase,
						batchId,
						examinerKey,
						'No course assignments found for this examiner',
						institutionCode,
						{ examinerName, examinerType }
					)
					await updateBatchCounts(supabase, batchId, sentCount, failedCount)
					continue
				}

				// Build ref number: JKKN{code}/ CoE/ YY-YY, {session months}/Sem Practicals
				const refNumber = buildPracticalRefNumber(institutionCode, examSessionName)
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
					examiner_department: examinerDepartment,
					examiner_institution: examinerInstitution,
					examiner_address: examinerAddress,
					examiner_mobile: examinerMobile,
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

				// Generate PDF
				let pdfBuffer: Buffer
				try {
					pdfBuffer = await generateAppointmentPdf(appointmentData)
				} catch (pdfErr) {
					console.error(`PDF generation failed for ${examinerKey}:`, pdfErr)
					failedCount++
					await logPracticalEmail(
						supabase,
						batchId,
						externalExaminerId,
						examinerEmail,
						'',
						'',
						'FAILED',
						{
							examinerName,
							examinerType,
							institutionCode,
							errorMessage: pdfErr instanceof Error ? pdfErr.message : 'PDF generation failed',
						}
					)
					await updateBatchCounts(supabase, batchId, sentCount, failedCount)
					continue
				}

				// Build email subject and body from template
				let emailSubject = `Appointment Letter - Practical Examiner - ${examSessionName}`
				let emailBody = `
<p>Dear Sir/Madam,</p>
<p>Greetings from ${institutionName}</p>
<p>Please find attached the practical examination appointment order for your reference.</p>
<p>If you are not in a position to accept this offer, please inform us through mail at <a href="mailto:${coeEmail}">${coeEmail}</a> immediately.</p>
<br/>
<p>Warm Regards,<br/>
${coeName}${coeQualifications ? ', ' + coeQualifications : ''},<br/>
Controller of Examinations,<br/>
${institutionName},<br/>
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

				// Send email with PDF attachment
				const sendResult = await sendEmail(
					{
						to: examinerEmail,
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
					institutionCode
				)

				// Log the email and update batch counters
				if (sendResult.success) {
					sentCount++
					await logPracticalEmail(
						supabase,
						batchId,
						externalExaminerId,
						examinerEmail,
						emailSubject,
						emailBody,
						'SENT',
						{ examinerName, examinerType, institutionCode }
					)
				} else {
					failedCount++
					await logPracticalEmail(
						supabase,
						batchId,
						externalExaminerId,
						examinerEmail,
						emailSubject,
						emailBody,
						'FAILED',
						{
							examinerName,
							examinerType,
							institutionCode,
							errorMessage: sendResult.error,
						}
					)
				}

				await updateBatchCounts(supabase, batchId, sentCount, failedCount)
			} catch (examinerErr) {
				console.error(`Unhandled error processing examiner key ${examinerKey}:`, examinerErr)
				failedCount++
				await logBatchEmailFailure(
					supabase,
					batchId,
					examinerKey,
					examinerErr instanceof Error ? examinerErr.message : 'Unexpected error',
					institutionCode
				)
				await updateBatchCounts(supabase, batchId, sentCount, failedCount)
			}
		}

		// 6. Mark batch as completed / partial / failed
		let finalStatus: 'completed' | 'partial' | 'failed'
		if (failedCount === 0) {
			finalStatus = 'completed'
		} else if (sentCount === 0) {
			finalStatus = 'failed'
		} else {
			finalStatus = 'partial'
		}

		await supabase
			.from('practical_email_batches')
			.update({
				status: finalStatus,
				sent_count: sentCount,
				failed_count: failedCount,
				completed_at: new Date().toISOString(),
			})
			.eq('id', batchId)
	} catch (batchErr) {
		console.error('Fatal error in processEmailBatch:', batchErr)

		// Mark batch as failed
		try {
			await supabase
				.from('practical_email_batches')
				.update({
					status: 'failed',
					sent_count: sentCount,
					failed_count: failedCount,
					completed_at: new Date().toISOString(),
				})
				.eq('id', batchId)
		} catch { /* ignore DB update errors */ }

		// Re-throw so the POST handler can surface the error
		throw batchErr
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fetch all practical exam timetable rows assigned to a given examiner,
 * including course info and student counts.
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
	// Build filter for the assignment query
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

	// Fetch timetable entries
	const { data: timetables } = await supabase
		.from('exam_timetables')
		.select('id, exam_date, session, course_id')
		.in('id', timetableIds)
		.eq('institutions_id', institutionsId)
		.eq('examination_session_id', examinationSessionId)
		.eq('is_published', true)

	if (!timetables || timetables.length === 0) return []

	const courseIds = [...new Set(timetables.map((t) => t.course_id).filter(Boolean))]

	// Fetch course details
	const { data: courses } = await supabase
		.from('courses')
		.select('id, course_code, course_name, board_code')
		.in('id', courseIds)

	const courseMap = new Map<string, { course_code: string; course_name: string; board_code: string }>()
	for (const c of courses || []) {
		courseMap.set(c.id, c)
	}

	// Fetch board names for programme column
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

	// Fetch student counts per timetable
	const { data: batchStudents } = await supabase
		.from('practical_batch_students')
		.select('exam_timetable_id')
		.in('exam_timetable_id', timetableIds)

	const studentCountMap = new Map<string, number>()
	for (const s of batchStudents || []) {
		studentCountMap.set(s.exam_timetable_id, (studentCountMap.get(s.exam_timetable_id) || 0) + 1)
	}

	// Sort: exam_date ASC -> FN before AN
	const sorted = [...timetables].sort((a, b) => {
		if (a.exam_date !== b.exam_date) return a.exam_date < b.exam_date ? -1 : 1
		return a.session === 'FN' ? -1 : 1
	})

	// Compute batch_no per course
	const batchCounters = new Map<string, number>()
	const result = sorted.map((t) => {
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

	return result
}

/**
 * Write an email log row that is linked to a practical batch.
 * Handles both external examiners (with examiners.id UUID) and
 * internal/skilled (where examiner_id is null — requires the DB
 * column to allow NULL or use a workaround insert).
 */
async function logPracticalEmail(
	supabase: ReturnType<typeof getSupabaseServer>,
	batchId: string,
	externalExaminerId: string | null,
	emailTo: string,
	emailSubject: string,
	emailBody: string,
	status: 'SENT' | 'FAILED',
	opts: {
		examinerName?: string
		examinerType?: string
		institutionCode?: string
		errorMessage?: string
	}
): Promise<void> {
	try {
		if (externalExaminerId) {
			// External examiner — use the standard logEmail helper
			await logEmail(externalExaminerId, emailTo, emailSubject, emailBody, status, {
				institutionCode: opts.institutionCode,
				errorMessage: opts.errorMessage,
			})

			// Then link to batch by updating the row we just inserted
			const supabaseClient = getSupabaseServer()
			const { data: lastLog } = await supabaseClient
				.from('examiner_email_logs')
				.select('id')
				.eq('examiner_id', externalExaminerId)
				.eq('email_to', emailTo)
				.order('created_at', { ascending: false })
				.limit(1)
				.single()

			if (lastLog?.id) {
				await supabaseClient
					.from('examiner_email_logs')
					.update({
						practical_batch_id: batchId,
						examiner_type: opts.examinerType || null,
					})
					.eq('id', lastLog.id)
			}
		} else {
			// Internal / skilled — direct insert without examiner_id FK
			// NOTE: This requires the examiner_id column to be nullable.
			// If the DB enforces NOT NULL, a separate migration should relax that constraint.
			await supabase.from('examiner_email_logs').insert({
				examiner_id: null,
				email_to: emailTo,
				email_subject: emailSubject,
				email_body: emailBody,
				status,
				practical_batch_id: batchId,
				examiner_type: opts.examinerType || null,
				institution_code: opts.institutionCode || null,
				error_message: opts.errorMessage || null,
				sent_at: status === 'SENT' ? new Date().toISOString() : null,
			})
		}
	} catch (logErr) {
		// Never let logging failures abort the main flow
		console.error('Failed to write email log:', logErr)
	}
}

/**
 * Log a failure for an examiner key that could not even be resolved to an email.
 */
async function logBatchEmailFailure(
	supabase: ReturnType<typeof getSupabaseServer>,
	batchId: string,
	examinerKey: string,
	errorMessage: string,
	institutionCode: string,
	extra?: { examinerName?: string; examinerType?: string }
): Promise<void> {
	try {
		await supabase.from('examiner_email_logs').insert({
			examiner_id: null,
			email_to: examinerKey, // store the key as placeholder
			email_subject: 'Practical Appointment Email',
			email_body: null,
			status: 'FAILED',
			practical_batch_id: batchId,
			examiner_type: extra?.examinerType || null,
			institution_code: institutionCode,
			error_message: errorMessage,
			sent_at: null,
		})
	} catch (logErr) {
		console.error('Failed to write failure log:', logErr)
	}
}

/**
 * Update running sent/failed counts on the batch record.
 */
async function updateBatchCounts(
	supabase: ReturnType<typeof getSupabaseServer>,
	batchId: string,
	sentCount: number,
	failedCount: number
): Promise<void> {
	await supabase
		.from('practical_email_batches')
		.update({ sent_count: sentCount, failed_count: failedCount })
		.eq('id', batchId)
}

/**
 * Build practical appointment ref number.
 * Format: JKKN{code}/ CoE/ YY-YY, {session months}/Sem Practicals
 * Example: JKKNCAS/ CoE/ 25-26, March-April/Sem Practicals
 */
function buildPracticalRefNumber(institutionCode: string, examSessionName: string): string {
	// Extract year from session name (e.g. "APRIL-MAY-2026" → 2026)
	const yearMatch = examSessionName.match(/\d{4}/)
	const year = yearMatch ? parseInt(yearMatch[0]) : new Date().getFullYear()
	const academicYear = `${String(year - 1).slice(-2)}-${String(year).slice(-2)}`

	// Extract month portion: "APRIL-MAY-2026" → "April-May"
	const sessionMonths = examSessionName
		.replace(/[-\s]*\d{4}/, '')
		.trim()
		.split(/[-\s]+/)
		.filter(Boolean)
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
		.join('-')

	return `JKKN${institutionCode}/ CoE/ ${academicYear}, ${sessionMonths}/Sem Practicals`
}
