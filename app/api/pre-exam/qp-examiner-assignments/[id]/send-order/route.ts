// E-mail the Examiner Order to the assigned examiner, with the PDF attached
// and a link into the portal.
//
// POST /api/pre-exam/qp-examiner-assignments/:id/send-order
// Body: { cc?: string[], custom_message?: string }
//
// Uses the institution's SMTP config (lib/services/email-service) and records
// the send both on the assignment and in examiner_email_logs.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { requireUserPermission } from '@/lib/auth/check-user-permission'
import { sendEmail, logEmail } from '@/lib/services/email-service'
import { loadAssignmentBundle, buildOrderData } from '@/lib/qp-portal/assignment-service'
import { generateExaminerOrderPdf, orderFilename } from '@/lib/pdf/examiner-order'
import { logAccess } from '@/lib/qp-portal/guard'
import { formatIst } from '@/lib/qp-portal/ist'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const VIEW_PERMISSION = 'page.pre_exam.qp_examiner_assignment.view'

function escapeHtml(v: unknown): string {
	return String(v ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params
	try {
		const perm = await requireUserPermission(VIEW_PERMISSION)
		if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status })

		const supabase = getSupabaseServer()
		const body = await req.json().catch(() => ({}))

		const bundle = await loadAssignmentBundle(supabase, id)
		if (!bundle) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })
		if (bundle.assignment.status === 'cancelled') {
			return NextResponse.json({ error: 'This assignment is cancelled.' }, { status: 400 })
		}

		const to = bundle.examiner?.email
		if (!to) {
			return NextResponse.json(
				{ error: 'The examiner has no e-mail address on record, so the order cannot be sent.' },
				{ status: 400 }
			)
		}

		const data = await buildOrderData(bundle)
		const pdf = await generateExaminerOrderPdf(data)
		const filename = orderFilename('ExaminerOrder', data.subject.course_code, data.examiner.full_name)

		const subject = `Appointment as Question Paper Setter — ${data.subject.course_code} ${data.subject.title} (${data.examination.session_label || data.examination.session_name || ''})`.trim()

		const html = `
<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.6;">
	<p>Respected ${escapeHtml(data.examiner.full_name)},</p>
	<p>
		You have been appointed as the
		<strong>${data.examiner.kind === 'internal' ? 'Internal' : 'External'} Question Paper Setter</strong>
		for <strong>${escapeHtml(data.subject.course_code)} — ${escapeHtml(data.subject.title)}</strong>
		${data.subject.set_label ? `(Set ${escapeHtml(data.subject.set_label)})` : ''}
		for the ${escapeHtml(data.examination.exam_type_name || 'End Semester Examinations')}
		${data.examination.session_label ? `, ${escapeHtml(data.examination.session_label)}` : ''}.
	</p>
	${body.custom_message ? `<p>${escapeHtml(body.custom_message)}</p>` : ''}
	<table cellpadding="6" cellspacing="0" style="border-collapse:collapse;margin:14px 0;font-size:13px;">
		<tr><td style="border:1px solid #ddd;background:#f7f7f7;"><strong>Question paper available from</strong></td>
			<td style="border:1px solid #ddd;">${escapeHtml(formatIst(data.assignment.valid_from))}</td></tr>
		<tr><td style="border:1px solid #ddd;background:#f7f7f7;"><strong>Submission deadline</strong></td>
			<td style="border:1px solid #ddd;">${escapeHtml(formatIst(data.assignment.valid_to))}</td></tr>
		${data.assignment.order_ref_no ? `<tr><td style="border:1px solid #ddd;background:#f7f7f7;"><strong>Order reference</strong></td><td style="border:1px solid #ddd;">${escapeHtml(data.assignment.order_ref_no)}</td></tr>` : ''}
	</table>
	<p>
		Please sign in to the Examiner Portal with this e-mail address
		(<strong>${escapeHtml(to)}</strong>) to read the instructions, enter the question paper
		and submit it:
	</p>
	<p><a href="${escapeHtml(data.assignment.portal_url)}"
		style="display:inline-block;padding:10px 18px;background:#1a365d;color:#fff;text-decoration:none;border-radius:4px;">
		Open the Examiner Portal</a></p>
	<p style="font-size:12px;color:#555;">
		Access opens and closes automatically at the times shown above (Indian Standard Time).
		The signed order copy is attached to this e-mail and is also available inside the portal.
	</p>
	<p>Office of the Controller of Examinations<br />${escapeHtml(data.institution.name)}</p>
</div>`

		const result = await sendEmail(
			{
				to,
				cc: Array.isArray(body.cc) && body.cc.length ? body.cc : undefined,
				subject,
				html,
				attachments: [{ filename, content: pdf, contentType: 'application/pdf' }],
			},
			data.institution.institution_code
		)

		// Log the attempt whether or not it succeeded — a failed send is exactly
		// what someone will come looking for later.
		try {
			await logEmail(
				bundle.assignment.examiner_id,
				to,
				subject,
				html,
				result.success ? 'SENT' : 'FAILED',
				{
					boardType: 'QP_SETTER_ORDER',
					institutionCode: data.institution.institution_code,
					errorMessage: result.success ? undefined : result.error || 'Unknown error',
				}
			)
		} catch (e) {
			console.warn('[QP assign] examiner_email_logs write failed:', e)
		}

		await logAccess(req, {
			action: 'order_emailed',
			examiner_id: bundle.assignment.examiner_id,
			assignment_id: id,
			paper_id: bundle.assignment.paper_id,
			institutions_id: bundle.assignment.institutions_id,
			denied: !result.success,
			reason: result.success ? null : result.error || 'send failed',
			detail: { to, by: perm.email },
		})

		if (!result.success) {
			return NextResponse.json(
				{ error: `The order could not be e-mailed: ${result.error || 'SMTP error'}` },
				{ status: 502 }
			)
		}

		const now = new Date().toISOString()
		await supabase
			.from('ia_qp_assignments')
			.update({ order_email_sent_at: now, order_issued_at: bundle.assignment.order_issued_at || now })
			.eq('id', id)

		return NextResponse.json({
			success: true,
			message: `Examiner order e-mailed to ${to}.`,
			sent_at: now,
		})
	} catch (error: any) {
		console.error('[QP assign] send-order failed for', id, error)
		return NextResponse.json({ error: error?.message || 'Failed to send the examiner order' }, { status: 500 })
	}
}
