// Examiner follow-up — where every appointment stands right now.
//
// GET /api/pre-exam/qp-examiner-assignments/status-report?institutions_id=&examination_session_id=
//     → one row per live appointment, with the examiner's contact details and
//       the STAGE it has reached, so the office knows whom to call or re-mail
// GET …&format=xlsx[&stage=a,b]
//     → the same as a workbook (Summary + Follow-up list)
//
// The stage is derived, never stored:
//
//   order_not_sent    the order e-mail has not gone out
//   not_logged_in     order sent, the examiner has never signed in to the portal
//   not_opened        signed in, but never opened THIS paper
//   not_started       opened the paper, no question entered
//   drafting          some questions entered
//   ready_to_submit   every question (and key, when appointed for it) entered — not submitted
//   returned          reopened by the CoE, resubmission awaited
//   claim_pending     paper submitted, claim form not submitted
//   completed         paper and claim both submitted

import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { getSupabaseServer } from '@/lib/supabase-server'
import { requireUserPermission } from '@/lib/auth/check-user-permission'
import { formatIst } from '@/lib/qp-portal/ist'
import { FOLLOW_UP_STAGES, loadFollowUpRows, type FollowUpRow } from '@/lib/qp-portal/follow-up'
import { QP_ASSIGNMENT_TYPE_LABELS, type QpAssignmentType } from '@/types/qp-examiner-assignment'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const VIEW_PERMISSION = 'page.pre_exam.qp_examiner_assignment.view'

async function buildWorkbook(rows: FollowUpRow[], head: { institution: string; session: string }): Promise<Buffer> {
	const wb = new ExcelJS.Workbook()
	wb.created = new Date()

	const decorate = (ws: ExcelJS.Worksheet, title: string) => {
		const columns = ws.columns.length
		ws.spliceRows(1, 0, [head.institution], [title], [`${head.session} · as on ${formatIst(new Date().toISOString(), false)}`], [])
		for (const n of [1, 2, 3]) {
			ws.mergeCells(n, 1, n, columns)
			const c = ws.getCell(n, 1)
			c.alignment = { horizontal: 'center' }
			c.font = { bold: true, size: n === 1 ? 13 : 11 }
		}
		const header = ws.getRow(5)
		header.font = { bold: true, color: { argb: 'FFFFFFFF' } }
		header.alignment = { vertical: 'middle', wrapText: true }
		header.eachCell(c => {
			c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } }
		})
		ws.eachRow((row, n) => {
			if (n < 5) return
			row.eachCell({ includeEmpty: true }, c => {
				c.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
			})
		})
		ws.views = [{ state: 'frozen', ySplit: 5 }]
	}

	const sum = wb.addWorksheet('Summary')
	sum.columns = [
		{ header: 'Stage', key: 'stage', width: 44 },
		{ header: 'Papers', key: 'papers', width: 10 },
		{ header: 'Examiners', key: 'examiners', width: 12 },
		{ header: 'What to do', key: 'action', width: 40 },
	]
	for (const s of FOLLOW_UP_STAGES) {
		const mine = rows.filter(r => r.stage === s.key)
		sum.addRow({ stage: s.label, papers: mine.length, examiners: new Set(mine.map(r => r.examiner_id)).size, action: s.action })
	}
	const t = sum.addRow({ stage: 'Total', papers: rows.length, examiners: new Set(rows.map(r => r.examiner_id)).size })
	t.font = { bold: true }
	decorate(sum, 'Examiner Status Report — Question Paper Setting')

	const ws = wb.addWorksheet('Follow-up list')
	ws.columns = [
		{ header: 'S.No', key: 'sno', width: 6 },
		{ header: 'Current status', key: 'stage', width: 36 },
		{ header: 'What to do', key: 'action', width: 32 },
		{ header: 'Examiner', key: 'name', width: 28 },
		{ header: 'Mobile', key: 'mobile', width: 15 },
		{ header: 'E-mail', key: 'email', width: 30 },
		{ header: 'Type', key: 'kind', width: 10 },
		{ header: 'Designation', key: 'designation', width: 20 },
		{ header: 'Department', key: 'department', width: 16 },
		{ header: 'College', key: 'college', width: 34 },
		{ header: 'Course code', key: 'code', width: 13 },
		{ header: 'Course title', key: 'title', width: 36 },
		{ header: 'Programme', key: 'program', width: 11 },
		{ header: 'Sem', key: 'sem', width: 6 },
		{ header: 'Appointed for', key: 'type', width: 24 },
		{ header: 'Questions entered', key: 'q', width: 11 },
		{ header: 'Answer keys entered', key: 'k', width: 11 },
		{ header: 'Order e-mailed on', key: 'mailed', width: 20 },
		{ header: 'Last login', key: 'login', width: 20 },
		{ header: 'Last saved', key: 'saved', width: 20 },
		{ header: 'Paper submitted on', key: 'submitted', width: 20 },
		{ header: 'Claim submitted on', key: 'claimed', width: 20 },
		{ header: 'Window closes', key: 'closes', width: 20 },
		{ header: 'Days left', key: 'days', width: 9 },
		{ header: 'Order Ref. No', key: 'ref', width: 24 },
	]
	const order = new Map(FOLLOW_UP_STAGES.map((s, i) => [s.key, i]))
	const at = (v: string | null) => (v ? formatIst(v, false) : '')
	;[...rows]
		.sort((a, b) => (order.get(a.stage)! - order.get(b.stage)!) || a.examiner_name.localeCompare(b.examiner_name))
		.forEach((r, i) => {
			const open = !['completed', 'claim_pending'].includes(r.stage)
			ws.addRow({
				sno: i + 1,
				stage: r.stage_label,
				action: r.action,
				name: r.examiner_name,
				mobile: r.mobile ? String(r.mobile) : '',
				email: r.email || '',
				kind: r.examiner_kind === 'internal' ? 'Internal' : 'External',
				designation: r.designation || '',
				department: r.department || '',
				college: r.institution_name || '',
				code: `${r.course_code || ''}${r.set_label ? ` (Set ${r.set_label})` : ''}`,
				title: r.subject_title || '',
				program: r.program_code || '',
				sem: r.semester ?? '',
				type: QP_ASSIGNMENT_TYPE_LABELS[r.assignment_type as QpAssignmentType] || r.assignment_type,
				q: `${r.question_done} / ${r.question_total}`,
				k: r.key_required ? `${r.key_done} / ${r.question_total}` : '—',
				mailed: at(r.order_email_sent_at),
				login: at(r.last_login_at),
				saved: at(r.last_saved_at),
				submitted: at(r.submitted_at),
				claimed: at(r.claim_submitted_at),
				closes: at(r.valid_to),
				days: open ? (r.days_left < 0 ? 'Closed' : r.days_left) : '',
				ref: r.order_ref_no || '',
			})
		})
	ws.getColumn('mobile').numFmt = '@'
	decorate(ws, 'Examiner Status Report — Follow-up list')

	return Buffer.from(await wb.xlsx.writeBuffer())
}

export async function GET(req: NextRequest) {
	try {
		const perm = await requireUserPermission(VIEW_PERMISSION)
		if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status })

		const { searchParams } = new URL(req.url)
		const institutionsId = searchParams.get('institutions_id')
		const sessionId = searchParams.get('examination_session_id')
		if (!institutionsId || !sessionId) {
			return NextResponse.json({ error: 'institutions_id and examination_session_id are required' }, { status: 400 })
		}

		const supabase = getSupabaseServer()
		let rows = await loadFollowUpRows(supabase, institutionsId, sessionId)

		if (searchParams.get('format') !== 'xlsx') {
			return NextResponse.json({
				data: rows,
				stages: FOLLOW_UP_STAGES.map(s => {
					const mine = rows.filter(r => r.stage === s.key)
					return { ...s, papers: mine.length, examiners: new Set(mine.map(r => r.examiner_id)).size }
				}),
			})
		}

		const only = (searchParams.get('stage') || '').split(',').map(s => s.trim()).filter(Boolean)
		if (only.length) rows = rows.filter(r => only.includes(r.stage))

		const [{ data: inst }, { data: sess }] = await Promise.all([
			supabase.from('institutions').select('name, institution_code').eq('id', institutionsId).maybeSingle(),
			supabase.from('examination_sessions').select('session_name, session_code').eq('id', sessionId).maybeSingle(),
		])
		const buffer = await buildWorkbook(rows, {
			institution: (inst as any)?.name || '',
			session: `Examination session: ${(sess as any)?.session_name || (sess as any)?.session_code || ''}`,
		})
		const code = String((inst as any)?.institution_code || 'COE').replace(/[^A-Za-z0-9_-]+/g, '')
		const sessCode = String((sess as any)?.session_code || 'session').replace(/[^A-Za-z0-9_-]+/g, '_')
		return new NextResponse(new Uint8Array(buffer), {
			status: 200,
			headers: {
				'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
				'Content-Disposition': `attachment; filename="ExaminerStatusReport_${code}_${sessCode}.xlsx"`,
				'Cache-Control': 'no-store, max-age=0',
			},
		})
	} catch (error: any) {
		console.error('[QP status report] failed:', error)
		return NextResponse.json({ error: error?.message || 'Failed to build the examiner status report' }, { status: 500 })
	}
}
