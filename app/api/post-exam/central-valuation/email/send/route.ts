import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { sendEmail } from '@/lib/services/email-service'
import { generateCentralValuationAppointmentPdf } from '@/lib/pdf/central-valuation-appointment-letter'
import { getPdfSettingsWithFallback } from '@/lib/pdf/settings-service'
import type {
	CentralValuationAppointmentData,
	CentralValuationCourseEntry,
	CentralValuationExaminerType,
} from '@/types/central-valuation-email'

export const maxDuration = 60

interface Recipient {
	examiner_type: CentralValuationExaminerType
	examiner_key: string
}

export async function POST(request: Request) {
	const body = await request.json()
	const {
		institutions_id,
		examination_session_id,
		board_code,
		recipients,
	} = body as {
		institutions_id: string
		examination_session_id: string
		board_code?: string
		recipients: Recipient[]
	}

	if (!institutions_id || !examination_session_id || !Array.isArray(recipients) || recipients.length === 0) {
		return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
	}

	const supabase = getSupabaseServer()

	const { data: inst } = await supabase
		.from('institutions')
		.select('id, name, institution_code, address')
		.eq('id', institutions_id)
		.single()
	const { data: session } = await supabase
		.from('examination_sessions')
		.select('session_name, session_code')
		.eq('id', examination_session_id)
		.single()
	const { data: board } = board_code
		? await supabase.from('board').select('board_name').eq('board_code', board_code).maybeSingle()
		: { data: null }

	const settings = await getPdfSettingsWithFallback(inst?.institution_code || '', 'default')

	const results: Array<{ examiner_type: string; examiner_key: string; status: 'SENT' | 'FAILED'; error?: string }> = []

	for (const r of recipients) {
		const res = await processOne(supabase, {
			institutions_id,
			examination_session_id,
			board_code,
			recipient: r,
			inst,
			session,
			board,
			settings,
		})
		results.push(res)
	}

	const sent = results.filter(r => r.status === 'SENT').length
	const failed = results.filter(r => r.status === 'FAILED').length

	return NextResponse.json({ success: true, sent, failed, results })
}

async function processOne(supabase: any, args: {
	institutions_id: string
	examination_session_id: string
	board_code?: string
	recipient: Recipient
	inst: any
	session: any
	board: any
	settings: any
}): Promise<{ examiner_type: string; examiner_key: string; status: 'SENT' | 'FAILED'; error?: string }> {
	const { institutions_id, examination_session_id, board_code, recipient, inst, session, board, settings } = args
	const { examiner_type, examiner_key } = recipient

	let columnStaff: string | null = null
	let staffFields: string[] = []

	switch (examiner_type) {
		case 'internal':
			columnStaff = 'internal_examiner_staff_id'
			staffFields = ['internal_examiner_name', 'internal_examiner_mobile', 'internal_examiner_designation', 'internal_examiner_email']
			break
		case 'chief':
			columnStaff = 'chief_examiner_staff_id'
			staffFields = ['chief_examiner_name', 'chief_examiner_mobile', 'chief_examiner_designation', 'chief_examiner_email']
			break
		case 'assistant':
			columnStaff = 'assistant_examiner_staff_id'
			staffFields = ['assistant_examiner_name', 'assistant_examiner_mobile', 'assistant_examiner_designation', 'assistant_examiner_email']
			break
	}

	const selectFields = ['course_id', 'total_sheets', ...(columnStaff ? [columnStaff, ...staffFields] : ['external_examiner_id'])].join(', ')
	let query = supabase
		.from('answer_sheet_packets')
		.select(selectFields)
		.eq('institutions_id', institutions_id)
		.eq('examination_session_id', examination_session_id)
		.eq('is_active', true)
		.range(0, 99999)

	if (columnStaff) query = query.eq(columnStaff, examiner_key)
	else query = query.eq('external_examiner_id', examiner_key)

	const { data: packets } = await query
	if (!packets || packets.length === 0) {
		return { examiner_type, examiner_key, status: 'FAILED', error: 'No assignments found' }
	}

	let examinerName = ''
	let examinerMobile: string | undefined
	let examinerDesignation: string | undefined
	let examinerEmail: string | undefined
	let examinerDepartment: string | undefined
	let examinerInstitution: string | undefined
	let examinerAddress: string | undefined

	if (columnStaff) {
		const first = packets[0] || {}
		examinerName = first[staffFields[0]] || ''
		examinerMobile = first[staffFields[1]] || undefined
		examinerDesignation = first[staffFields[2]] || undefined
		examinerEmail = first[staffFields[3]] || undefined
	} else {
		const { data: ext } = await supabase
			.from('examiners')
			.select('full_name, mobile, designation, department, institution_name, email, address, city, state, pincode')
			.eq('id', examiner_key)
			.maybeSingle()
		if (ext) {
			examinerName = ext.full_name || ''
			examinerMobile = ext.mobile || undefined
			examinerDesignation = ext.designation || undefined
			examinerEmail = ext.email || undefined
			examinerDepartment = ext.department || undefined
			examinerInstitution = ext.institution_name || undefined
			examinerAddress = [ext.address, ext.city, ext.state, ext.pincode].filter(Boolean).join(', ') || undefined
		}
	}

	if (!examinerEmail) {
		await logEmail(supabase, {
			institutions_id,
			examination_session_id,
			examiner_type,
			examiner_key,
			examiner_name: examinerName,
			email_to: '(missing)',
			status: 'FAILED',
			error_message: 'No email address on record',
		})
		return { examiner_type, examiner_key, status: 'FAILED', error: 'No email address' }
	}

	// Build course entries
	const courseIds = [...new Set(packets.map((p: any) => p.course_id))]
	let coursesQuery = supabase
		.from('courses')
		.select('id, course_code, course_name, course_title, board_code')
		.in('id', courseIds)
	if (board_code) coursesQuery = coursesQuery.eq('board_code', board_code)
	const { data: courses } = await coursesQuery
	const courseMap = new Map((courses || []).map((c: any) => [c.id, c]))

	const { data: cvDates } = await supabase
		.from('course_valuation_dates')
		.select('course_id, valuation_date')
		.eq('institutions_id', institutions_id)
		.eq('examination_session_id', examination_session_id)
	const dateMap = new Map((cvDates || []).map((d: any) => [d.course_id, d.valuation_date]))

	const courseAgg = new Map<string, { packet_count: number; sheet_count: number }>()
	for (const p of packets as any[]) {
		if (!courseMap.has(p.course_id)) continue
		const prev = courseAgg.get(p.course_id) || { packet_count: 0, sheet_count: 0 }
		prev.packet_count += 1
		prev.sheet_count += p.total_sheets || 0
		courseAgg.set(p.course_id, prev)
	}

	const courseEntries: CentralValuationCourseEntry[] = [...courseAgg.entries()].map(([cid, agg]) => {
		const c = courseMap.get(cid) as any
		return {
			course_code: c.course_code,
			course_name: c.course_name || c.course_title,
			valuation_date: dateMap.get(cid) as string || '',
			packet_count: agg.packet_count,
			sheet_count: agg.sheet_count,
		}
	})

	const dates = courseEntries.map(c => c.valuation_date).filter(Boolean).sort()
	const dateRange = dates.length === 0 ? '' : dates[0] === dates[dates.length - 1] ? dates[0] : `${dates[0]} to ${dates[dates.length - 1]}`

	const letterData: CentralValuationAppointmentData = {
		institution_name: inst?.name,
		institution_address: inst?.address,
		ref_number: `JKKNCAS/CoE/${(session?.session_code || '').slice(0, 8)}`,
		letter_date: new Date().toISOString().slice(0, 10),
		examiner_name: examinerName || 'Examiner',
		examiner_type,
		examiner_role: {
			internal: 'Internal Examiner',
			external: 'External Examiner',
			chief: 'Chief Examiner',
			assistant: 'Assistant Examiner',
		}[examiner_type],
		examiner_designation: examinerDesignation,
		examiner_department: examinerDepartment,
		examiner_institution: examinerInstitution,
		examiner_address: examinerAddress,
		examiner_mobile: examinerMobile,
		board_name: board?.board_name || board_code || '',
		board_code: board_code || '',
		exam_session_name: session?.session_name || '',
		valuation_date_range: dateRange,
		courses: courseEntries,
		pdf_settings: settings,
		coe_email: 'coearts@jkkn.ac.in',
	}

	const subject = `Appointment of Examiner for ${session?.session_name || ''} Examinations- Reg.`
	const bodyHtml = `<p>Sir/Madam,</p><p>Here I have attached your appointment ; we are expecting your acceptance Mail.</p><p>With Regards,<br/>Controller of Examinations</p>`

	try {
		const pdfBuffer = await generateCentralValuationAppointmentPdf(letterData)

		const result = await sendEmail(
			{
				to: examinerEmail,
				subject,
				html: bodyHtml,
				attachments: [
					{
						filename: `appointment-${examinerName.replace(/\s+/g, '-')}.pdf`,
						content: pdfBuffer,
						contentType: 'application/pdf',
					},
				],
			},
			inst?.institution_code,
		)

		if (!result.success) {
			await logEmail(supabase, {
				institutions_id,
				examination_session_id,
				examiner_type,
				examiner_key,
				examiner_name: examinerName,
				email_to: examinerEmail,
				status: 'FAILED',
				error_message: result.error || 'Unknown error',
				subject,
			})
			return { examiner_type, examiner_key, status: 'FAILED', error: result.error }
		}

		await logEmail(supabase, {
			institutions_id,
			examination_session_id,
			examiner_type,
			examiner_key,
			examiner_name: examinerName,
			email_to: examinerEmail,
			status: 'SENT',
			subject,
		})

		return { examiner_type, examiner_key, status: 'SENT' }
	} catch (err: any) {
		await logEmail(supabase, {
			institutions_id,
			examination_session_id,
			examiner_type,
			examiner_key,
			examiner_name: examinerName,
			email_to: examinerEmail,
			status: 'FAILED',
			error_message: err.message || 'Unknown error',
			subject,
		})
		return { examiner_type, examiner_key, status: 'FAILED', error: err.message }
	}
}

async function logEmail(supabase: any, row: {
	institutions_id: string
	examination_session_id: string
	examiner_type: string
	examiner_key: string
	examiner_name?: string
	email_to: string
	status: 'SENT' | 'FAILED' | 'PENDING'
	error_message?: string
	subject?: string
}) {
	await supabase.from('central_valuation_email_log').insert({
		institutions_id: row.institutions_id,
		examination_session_id: row.examination_session_id,
		examiner_type: row.examiner_type,
		examiner_key: row.examiner_key,
		examiner_name: row.examiner_name || null,
		email_to: row.email_to,
		status: row.status,
		error_message: row.error_message || null,
		subject: row.subject || null,
	})
}
