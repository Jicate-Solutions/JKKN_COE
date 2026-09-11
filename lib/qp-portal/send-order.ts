// E-mailing the examiner order — shared by the Send Order button, the bulk
// E-mail Orders tab and any CoE action that changes the appointment and must
// tell the examiner (changing the assignment type, for one).
//
// ONE examiner, ONE e-mail: when the same person holds several papers in the
// session, a single order lists every course in its table and goes out once,
// with one PDF attached. The order is rebuilt from the assignments as they
// stand NOW, so a re-sent order always reflects the current type, fees and
// window.

import type { NextRequest } from 'next/server'
import { sendEmail, logEmail } from '@/lib/services/email-service'
import {
	loadAssignmentBundle,
	buildCombinedOrderData,
	nextOrderRef,
	type AssignmentBundle,
} from '@/lib/qp-portal/assignment-service'
import { getPortalContent } from '@/lib/qp-portal/content'
import { generateExaminerOrderPdf, orderFilename } from '@/lib/pdf/examiner-order'
import { logAccess } from '@/lib/qp-portal/guard'
import { formatIst } from '@/lib/qp-portal/ist'
import { QP_ASSIGNMENT_TYPE_LABELS, type QpAssignmentType } from '@/types/qp-examiner-assignment'
import { getJkknLetterhead } from '@/lib/pdf/jkkn-letterhead'

function escapeHtml(v: unknown): string {
	return String(v ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
}

export interface SendOrderOptions {
	/** 'appointment' — the first order; 'updated' — the appointment changed. */
	variant?: 'appointment' | 'updated'
	/** For 'updated': what changed, in one sentence, shown to the examiner. */
	changeSummary?: string | null
	customMessage?: string | null
	cc?: string[]
	by: { userId?: string | null; email?: string | null }
	/** When present the send is written to the access log with the caller's origin. */
	req?: NextRequest
	/** Bulk sends log without a request; pass the actor's label instead. */
	source?: 'button' | 'bulk' | 'change_type'
}

export type SendOrderResult =
	| { ok: true; to: string; sentAt: string; message: string; assignmentIds: string[] }
	| { ok: false; status: number; error: string; assignmentIds: string[] }

/**
 * Send the examiner order for one assignment, or one combined order for several
 * assignments that all belong to the SAME examiner.
 */
export async function sendExaminerOrderEmail(
	supabase: any,
	assignmentIds: string | string[],
	opts: SendOrderOptions
): Promise<SendOrderResult> {
	const ids = (Array.isArray(assignmentIds) ? assignmentIds : [assignmentIds]).filter(Boolean)
	if (ids.length === 0) return { ok: false, status: 400, error: 'No assignment given.', assignmentIds: [] }

	const bundles: AssignmentBundle[] = []
	for (const id of ids) {
		const b = await loadAssignmentBundle(supabase, id)
		if (!b) return { ok: false, status: 404, error: `Assignment ${id} not found`, assignmentIds: ids }
		if (b.assignment.status === 'cancelled') continue
		bundles.push(b)
	}
	if (bundles.length === 0) return { ok: false, status: 400, error: 'Every assignment given is cancelled.', assignmentIds: ids }

	const examinerId = bundles[0].assignment.examiner_id
	if (bundles.some(b => b.assignment.examiner_id !== examinerId)) {
		return { ok: false, status: 400, error: 'A combined order must belong to one examiner.', assignmentIds: ids }
	}

	const to = bundles[0].examiner?.email
	if (!to) {
		return {
			ok: false,
			status: 400,
			error: 'The examiner has no e-mail address on record, so the order cannot be sent.',
			assignmentIds: ids,
		}
	}

	// A combined letter is issued under ONE reference, shared by every appointment
	// it covers. Reuse the reference an identical set already holds (a re-send
	// is the same letter again); otherwise draw the next number from the
	// institution's sequence and record it before the letter is built.
	if (bundles.length > 1) {
		const held = bundles.map(b => b.assignment.combined_order_ref_no).filter(Boolean) as string[]
		const reusable = held.length === bundles.length && new Set(held).size === 1 ? held[0] : null
		if (!reusable) {
			const a0 = bundles[0].assignment
			const content = await getPortalContent(a0.institutions_id, 'order', a0.examination_session_id)
			const ref = await nextOrderRef(supabase, a0.institutions_id, content.letter_ref, bundles[0].institution?.institution_code)
			const { error: refErr } = await supabase
				.from('ia_qp_assignments')
				.update({ combined_order_ref_no: ref, combined_order_issued_at: new Date().toISOString() })
				.in('id', bundles.map(b => b.assignment.id))
			if (refErr) {
				// Column not migrated yet: the letter still goes out under the lowest
				// covered number (buildCombinedOrderData's fallback).
				console.warn('[QP assign] combined reference not stored (run 20260911_qp_assignment_combined_ref.sql):', refErr.message)
			} else {
				for (const b of bundles) b.assignment.combined_order_ref_no = ref
			}
		}
	}

	const data = await buildCombinedOrderData(bundles)
	const pdf = await generateExaminerOrderPdf(data)
	const first = bundles[0]
	const filename = orderFilename(
		'ExaminerOrder',
		bundles.length > 1 ? `${bundles.length}_papers` : data.subject.course_code,
		data.examiner.full_name
	)
	const updated = opts.variant === 'updated'

	// The role named in the subject: the widest of the appointments covered.
	const types = new Set<QpAssignmentType>(
		bundles.map(b => (b.assignment.assignment_type as QpAssignmentType) || 'question_paper')
	)
	const role =
		types.has('both') || (types.has('question_paper') && types.has('answer_key'))
			? QP_ASSIGNMENT_TYPE_LABELS.both
			: QP_ASSIGNMENT_TYPE_LABELS[[...types][0] || 'question_paper']

	const session = data.examination.session_label || data.examination.session_name || ''
	const courseList = bundles.map(
		b => `${b.assignment.course_code}${b.assignment.set_label ? ` (Set ${b.assignment.set_label})` : ''} — ${b.assignment.subject_title}`
	)
	const subject = `${updated ? 'Updated appointment' : 'Appointment'} — ${role} — ${
		bundles.length > 1 ? `${bundles.length} papers` : `${data.subject.course_code} ${data.subject.title}`
	}${session ? ` (${session})` : ''}`

	// The sign-off: the college's configured block (officer, designation, college,
	// phone) when it has one, else the office and the college name.
	const signatureLines = getJkknLetterhead(data.institution.institution_code)?.emailSignature
	const signOff = (signatureLines && signatureLines.length
		? signatureLines
		: ['Office of the Controller of Examinations', data.institution.name]
	)
		.map((l, i) => (i === 0 ? `<strong>${escapeHtml(l)}</strong>` : escapeHtml(l)))
		.join('<br />')

	const courseRows = bundles
		.map(
			b => `<tr>
			<td style="border:1px solid #ddd;">${escapeHtml(b.assignment.course_code)}${b.assignment.set_label ? ` (Set ${escapeHtml(b.assignment.set_label)})` : ''}</td>
			<td style="border:1px solid #ddd;">${escapeHtml(b.assignment.subject_title)}</td>
			<td style="border:1px solid #ddd;">${escapeHtml(QP_ASSIGNMENT_TYPE_LABELS[(b.assignment.assignment_type as QpAssignmentType) || 'question_paper'])}</td>
			<td style="border:1px solid #ddd;white-space:nowrap;">${escapeHtml(formatIst(b.assignment.valid_to))}</td>
		</tr>`
		)
		.join('')

	const html = `
<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.6;">
	<p>Respected ${escapeHtml(data.examiner.full_name)},</p>
	${
		updated
			? `<p>
		Your appointment as <strong>${data.examiner.kind === 'internal' ? 'Internal' : 'External'} Examiner</strong>
		has been <strong>updated</strong> by the Office of the Controller of Examinations.
	</p>
	${opts.changeSummary ? `<p style="padding:10px 12px;background:#fff7ed;border:1px solid #fed7aa;border-radius:4px;">${escapeHtml(opts.changeSummary)}</p>` : ''}
	<p>The appointment now covers: <strong>${escapeHtml(role)}</strong>. The revised order copy is attached.</p>`
			: `<p>
		You have been appointed as the
		<strong>${data.examiner.kind === 'internal' ? 'Internal' : 'External'} Examiner — ${escapeHtml(role)}</strong>
		for the ${escapeHtml(data.examination.exam_type_name || 'End Semester Examinations')}${session ? `, ${escapeHtml(session)}` : ''},
		for the ${bundles.length > 1 ? `${bundles.length} courses` : 'course'} listed below. The order copy is attached.
	</p>`
	}
	${opts.customMessage ? `<p>${escapeHtml(opts.customMessage)}</p>` : ''}
	<table cellpadding="6" cellspacing="0" style="border-collapse:collapse;margin:14px 0;font-size:13px;">
		<tr style="background:#f7f7f7;">
			<th style="border:1px solid #ddd;text-align:left;">Course code</th>
			<th style="border:1px solid #ddd;text-align:left;">Course</th>
			<th style="border:1px solid #ddd;text-align:left;">Appointment</th>
			<th style="border:1px solid #ddd;text-align:left;">Submission deadline</th>
		</tr>
		${courseRows}
	</table>
	<table cellpadding="6" cellspacing="0" style="border-collapse:collapse;margin:0 0 14px;font-size:13px;">
		<tr><td style="border:1px solid #ddd;background:#f7f7f7;"><strong>Question paper available from</strong></td>
			<td style="border:1px solid #ddd;">${escapeHtml(formatIst(data.assignment.valid_from))}</td></tr>
		${data.assignment.order_ref_no ? `<tr><td style="border:1px solid #ddd;background:#f7f7f7;"><strong>Order reference</strong></td><td style="border:1px solid #ddd;">${escapeHtml(data.assignment.order_ref_no)}</td></tr>` : ''}
	</table>
	<p>
		Please sign in to the Examiner Portal with this e-mail address
		(<strong>${escapeHtml(to)}</strong>) to record your acceptance, read the instructions,
		${updated ? 'complete what the update asks of you' : 'enter each question paper'} and submit:
	</p>
	<p><a href="${escapeHtml(data.assignment.portal_url)}"
		style="display:inline-block;padding:10px 18px;background:#1a365d;color:#fff;text-decoration:none;border-radius:4px;">
		Open the Examiner Portal</a></p>
	<p style="font-size:12px;color:#555;">
		Access opens and closes automatically at the times shown (Indian Standard Time).
		The signed order copy is attached to this e-mail and is also available inside the portal.
	</p>
	<p>${signOff}</p>
</div>`

	const result = await sendEmail(
		{
			to,
			cc: Array.isArray(opts.cc) && opts.cc.length ? opts.cc : undefined,
			subject,
			html,
			attachments: [{ filename, content: pdf, contentType: 'application/pdf' }],
		},
		data.institution.institution_code
	)

	// Log the attempt whether or not it succeeded — a failed send is exactly
	// what someone will come looking for later.
	try {
		await logEmail(examinerId, to, subject, html, result.success ? 'SENT' : 'FAILED', {
			boardType: 'QP_SETTER_ORDER',
			institutionCode: data.institution.institution_code,
			errorMessage: result.success ? undefined : result.error || 'Unknown error',
		})
	} catch (e) {
		console.warn('[QP assign] examiner_email_logs write failed:', e)
	}

	const now = new Date().toISOString()
	const coveredIds = bundles.map(b => b.assignment.id)

	if (opts.req) {
		for (const b of bundles) {
			await logAccess(opts.req, {
				action: 'order_emailed',
				examiner_id: examinerId,
				assignment_id: b.assignment.id,
				paper_id: b.assignment.paper_id,
				institutions_id: b.assignment.institutions_id,
				denied: !result.success,
				reason: result.success ? null : result.error || 'send failed',
				module: 'document',
				performed_by_user_id: opts.by.userId || null,
				performed_by_email: opts.by.email || null,
				performed_by_role: 'coe',
				detail: {
					to,
					by: opts.by.email,
					variant: opts.variant || 'appointment',
					source: opts.source || 'button',
					change: opts.changeSummary || null,
					courses: courseList,
					combined_with: coveredIds.filter(x => x !== b.assignment.id),
					order_ref_no: data.assignment.order_ref_no,
				},
			})
		}
	}

	if (!result.success) {
		return {
			ok: false,
			status: 502,
			error: `The order could not be e-mailed: ${result.error || 'SMTP error'}`,
			assignmentIds: coveredIds,
		}
	}

	await supabase
		.from('ia_qp_assignments')
		.update({ order_email_sent_at: now })
		.in('id', coveredIds)
	// order_issued_at is set once, on the first send.
	await supabase
		.from('ia_qp_assignments')
		.update({ order_issued_at: now })
		.in('id', coveredIds)
		.is('order_issued_at', null)

	void first
	return {
		ok: true,
		to,
		sentAt: now,
		message: `${updated ? 'Updated examiner order' : 'Examiner order'}${bundles.length > 1 ? ` covering ${bundles.length} papers` : ''} e-mailed to ${to}.`,
		assignmentIds: coveredIds,
	}
}
