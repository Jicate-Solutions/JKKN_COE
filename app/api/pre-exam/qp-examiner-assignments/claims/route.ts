// Examiner claims — what each examiner has claimed for the session.
//
// GET /api/pre-exam/qp-examiner-assignments/claims?institutions_id=&examination_session_id=
//     → one row per examiner with every live appointment under it
// GET …&format=xlsx[&scope=claimed|all][&examiner_ids=a,b]
//     → the Examiner Claim Report as a workbook (Summary + Paper-wise sheets)
// GET …&format=pdf[&examiner_ids=a,b]
//     → the Consolidated Claim Report, on the college letterhead (claimed papers only)
//
// One claim form covers every paper an examiner claimed in the session, so the
// examiner — not the paper — is the unit here, exactly as on the claim PDF.

import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { getSupabaseServer } from '@/lib/supabase-server'
import { requireUserPermission } from '@/lib/auth/check-user-permission'
import { describeAcceptedWork } from '@/lib/qp-portal/assignment-service'
import { generateClaimReportPdf } from '@/lib/pdf/examiner-order'
import { logAccess } from '@/lib/qp-portal/guard'
import { formatIst } from '@/lib/qp-portal/ist'
import { QP_CLAIM_STATUS_LABELS, type QpClaimStatus } from '@/types/qp-examiner-assignment'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// The PDF report is a Chromium render.
export const maxDuration = 60

const VIEW_PERMISSION = 'page.pre_exam.qp_examiner_assignment.view'
const CLAIMED: QpClaimStatus[] = ['submitted', 'approved', 'paid']

export interface ClaimPaperRow {
	id: string
	course_code: string | null
	subject_title: string | null
	set_label: string | null
	semester: number | null
	program_code: string | null
	work: string
	status: string
	submitted_at: string | null
	order_ref_no: string | null
	amount: number
	/** The amount split by component; qp_amount + ak_amount === amount. */
	qp_amount: number
	ak_amount: number
	claim_status: QpClaimStatus
	claim_submitted_at: string | null
	claim_version: number
	claim_reopened_at: string | null
}

export interface ClaimExaminerRow {
	examiner_id: string
	full_name: string
	email: string | null
	mobile: string | null
	kind: 'internal' | 'external'
	designation: string | null
	department: string | null
	institution_name: string | null
	papers: ClaimPaperRow[]
	claimed_count: number
	/** Papers submitted whose claim has not been made yet. */
	awaiting_count: number
	claimed_amount: number
	last_claimed_at: string | null
	bank: {
		account_holder: string | null
		bank_name: string | null
		account_number: string | null
		branch: string | null
		ifsc: string | null
	} | null
}

async function loadClaims(supabase: any, institutionsId: string, sessionId: string): Promise<ClaimExaminerRow[]> {
	const { data: rows, error } = await supabase
		.from('ia_qp_assignments')
		.select('*')
		.eq('institutions_id', institutionsId)
		.eq('examination_session_id', sessionId)
		.neq('status', 'cancelled')
		.order('course_code', { ascending: true })
		.order('id', { ascending: true })
		.range(0, 999)
	if (error) throw new Error(error.message)

	const examinerIds = [...new Set(((rows || []) as any[]).map(r => r.examiner_id).filter(Boolean))]
	if (examinerIds.length === 0) return []

	const { data: examiners } = await supabase
		.from('examiners')
		.select('id, full_name, email, mobile, designation, department, institution_name')
		.in('id', examinerIds)
	const exById = new Map<string, any>(((examiners || []) as any[]).map(e => [e.id, e]))

	const grouped = new Map<string, ClaimExaminerRow>()
	for (const r of (rows || []) as any[]) {
		let g = grouped.get(r.examiner_id)
		if (!g) {
			const e = exById.get(r.examiner_id) || {}
			g = {
				examiner_id: r.examiner_id,
				full_name: e.full_name || 'Unknown examiner',
				email: e.email || null,
				mobile: e.mobile || null,
				kind: r.examiner_kind === 'internal' ? 'internal' : 'external',
				designation: e.designation || null,
				department: e.department || null,
				institution_name: e.institution_name || null,
				papers: [],
				claimed_count: 0,
				awaiting_count: 0,
				claimed_amount: 0,
				last_claimed_at: null,
				bank: null,
			}
			grouped.set(r.examiner_id, g)
		}
		const claimStatus = (r.claim_status || 'pending') as QpClaimStatus
		const amount = Number(r.claim_amount ?? r.remuneration ?? 0) || 0
		// Split by what the examiner accepted. A row whose stored fees do not add
		// up to the claim (it predates per-component fees) keeps the whole amount
		// under its one component.
		const type = r.assignment_type || 'question_paper'
		let qpAmount = type !== 'answer_key' && r.qp_willing !== false ? Number(r.qp_fee || 0) : 0
		let akAmount = type !== 'question_paper' && r.ak_willing === true ? Number(r.ak_fee || 0) : 0
		if (qpAmount + akAmount !== amount) {
			qpAmount = type === 'answer_key' ? 0 : amount
			akAmount = type === 'answer_key' ? amount : 0
		}
		g.papers.push({
			id: r.id,
			course_code: r.course_code,
			subject_title: r.subject_title,
			set_label: r.set_label,
			semester: r.semester,
			program_code: r.program_code,
			work: describeAcceptedWork(r),
			status: r.status,
			submitted_at: r.submitted_at || null,
			order_ref_no: r.combined_order_ref_no || r.order_ref_no || null,
			amount,
			qp_amount: qpAmount,
			ak_amount: akAmount,
			claim_status: claimStatus,
			claim_submitted_at: r.claim_submitted_at || null,
			claim_version: r.claim_version || 0,
			claim_reopened_at: r.claim_reopened_at || null,
		})
		if (CLAIMED.includes(claimStatus)) {
			g.claimed_count++
			g.claimed_amount += amount
			// The account printed on the form: the latest claim's snapshot.
			if (!g.last_claimed_at || (r.claim_submitted_at || '') > g.last_claimed_at) {
				g.last_claimed_at = r.claim_submitted_at || g.last_claimed_at
				g.bank = {
					account_holder: r.claim_account_holder || null,
					bank_name: r.claim_bank_name || null,
					account_number: r.claim_account_number || null,
					branch: r.claim_branch || null,
					ifsc: r.claim_ifsc || null,
				}
			}
		} else if (['submitted', 'accepted'].includes(r.status)) {
			g.awaiting_count++
		}
	}

	return [...grouped.values()].sort((a, b) => {
		if ((a.claimed_count > 0) !== (b.claimed_count > 0)) return a.claimed_count > 0 ? -1 : 1
		return a.full_name.localeCompare(b.full_name)
	})
}

async function buildWorkbook(
	data: ClaimExaminerRow[],
	head: { institution: string; session: string },
	scope: 'claimed' | 'all'
): Promise<Buffer> {
	const wb = new ExcelJS.Workbook()
	wb.created = new Date()

	const style = (ws: ExcelJS.Worksheet, columns: number, title: string) => {
		ws.spliceRows(1, 0, [head.institution], [title], [head.session], [])
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
				c.border = {
					top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' },
				}
			})
		})
		ws.views = [{ state: 'frozen', ySplit: 5 }]
	}

	// ── Summary: one line per examiner, what is to be paid and to which account ──
	const sum = wb.addWorksheet('Summary')
	sum.columns = [
		{ header: 'S.No', key: 'sno', width: 6 },
		{ header: 'Examiner', key: 'name', width: 28 },
		{ header: 'Type', key: 'kind', width: 10 },
		{ header: 'Designation', key: 'designation', width: 22 },
		{ header: 'College', key: 'college', width: 34 },
		{ header: 'Mobile', key: 'mobile', width: 14 },
		{ header: 'E-mail', key: 'email', width: 28 },
		{ header: 'Papers claimed', key: 'count', width: 10 },
		{ header: 'Course codes', key: 'codes', width: 26 },
		{ header: 'Amount (Rs.)', key: 'amount', width: 13 },
		{ header: 'Claim status', key: 'status', width: 16 },
		{ header: 'Claimed on', key: 'claimed_at', width: 20 },
		{ header: 'Account holder', key: 'holder', width: 26 },
		{ header: 'Bank', key: 'bank', width: 24 },
		{ header: 'Account number', key: 'account', width: 20 },
		{ header: 'Branch', key: 'branch', width: 20 },
		{ header: 'IFSC', key: 'ifsc', width: 14 },
	]
	const summaryRows = scope === 'claimed' ? data.filter(d => d.claimed_count > 0) : data
	let total = 0
	summaryRows.forEach((d, i) => {
		const claimed = d.papers.filter(p => CLAIMED.includes(p.claim_status))
		const statuses = [...new Set(claimed.map(p => QP_CLAIM_STATUS_LABELS[p.claim_status]))]
		total += d.claimed_amount
		sum.addRow({
			sno: i + 1,
			name: d.full_name,
			kind: d.kind === 'internal' ? 'Internal' : 'External',
			designation: d.designation || '',
			college: d.institution_name || '',
			mobile: d.mobile || '',
			email: d.email || '',
			count: d.claimed_count,
			codes: claimed.map(p => p.course_code).join(', '),
			amount: d.claimed_amount,
			status: statuses.join(', ') || 'Not claimed',
			claimed_at: d.last_claimed_at ? formatIst(d.last_claimed_at, false) : '',
			holder: d.bank?.account_holder || '',
			bank: d.bank?.bank_name || '',
			// Text, so a long account number is never turned into 1.23E+15.
			account: d.bank?.account_number ? String(d.bank.account_number) : '',
			branch: d.bank?.branch || '',
			ifsc: d.bank?.ifsc || '',
		})
	})
	const totalRow = sum.addRow({ codes: 'Total', amount: total })
	totalRow.font = { bold: true }
	sum.getColumn('account').numFmt = '@'
	sum.getColumn('amount').numFmt = '#,##0'
	style(sum, sum.columns.length, 'Examiner Claim Report — Question Paper Setting')

	// ── Paper-wise: one line per appointment ──
	const det = wb.addWorksheet('Paper-wise')
	det.columns = [
		{ header: 'S.No', key: 'sno', width: 6 },
		{ header: 'Examiner', key: 'name', width: 28 },
		{ header: 'Type', key: 'kind', width: 10 },
		{ header: 'College', key: 'college', width: 34 },
		{ header: 'Course code', key: 'code', width: 13 },
		{ header: 'Course title', key: 'title', width: 38 },
		{ header: 'Programme', key: 'program', width: 12 },
		{ header: 'Sem', key: 'sem', width: 6 },
		{ header: 'Work', key: 'work', width: 26 },
		{ header: 'Order Ref. No', key: 'ref', width: 24 },
		{ header: 'Paper status', key: 'pstatus', width: 14 },
		{ header: 'Paper submitted on', key: 'psub', width: 20 },
		{ header: 'Question paper (Rs.)', key: 'qp', width: 13 },
		{ header: 'Answer key (Rs.)', key: 'ak', width: 13 },
		{ header: 'Amount (Rs.)', key: 'amount', width: 13 },
		{ header: 'Claim status', key: 'cstatus', width: 16 },
		{ header: 'Claimed on', key: 'csub', width: 20 },
		{ header: 'Claim version', key: 'ver', width: 9 },
	]
	let n = 0
	let detTotal = 0
	for (const d of data) {
		for (const p of d.papers) {
			const isClaimed = CLAIMED.includes(p.claim_status)
			if (scope === 'claimed' && !isClaimed) continue
			if (isClaimed) detTotal += p.amount
			det.addRow({
				sno: ++n,
				name: d.full_name,
				kind: d.kind === 'internal' ? 'Internal' : 'External',
				college: d.institution_name || '',
				code: `${p.course_code || ''}${p.set_label ? ` (Set ${p.set_label})` : ''}`,
				title: p.subject_title || '',
				program: p.program_code || '',
				sem: p.semester ?? '',
				work: p.work,
				ref: p.order_ref_no || '',
				pstatus: p.status,
				psub: p.submitted_at ? formatIst(p.submitted_at, false) : '',
				qp: p.qp_amount,
				ak: p.ak_amount,
				amount: p.amount,
				cstatus: QP_CLAIM_STATUS_LABELS[p.claim_status] || p.claim_status,
				csub: p.claim_submitted_at ? formatIst(p.claim_submitted_at, false) : '',
				ver: p.claim_version ? `V${p.claim_version}` : '',
			})
		}
	}
	const detTotalRow = det.addRow({ work: 'Total claimed', amount: detTotal })
	detTotalRow.font = { bold: true }
	det.getColumn('amount').numFmt = '#,##0'
	style(det, det.columns.length, 'Examiner Claim Report — Paper-wise')

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
		let data = await loadClaims(supabase, institutionsId, sessionId)

		const format = searchParams.get('format')
		if (format !== 'xlsx' && format !== 'pdf') {
			const claimedExaminers = data.filter(d => d.claimed_count > 0)
			return NextResponse.json({
				data,
				summary: {
					examiners: data.length,
					claimed_examiners: claimedExaminers.length,
					claimed_papers: data.reduce((t, d) => t + d.claimed_count, 0),
					awaiting_papers: data.reduce((t, d) => t + d.awaiting_count, 0),
					claimed_amount: data.reduce((t, d) => t + d.claimed_amount, 0),
				},
			})
		}

		const only = (searchParams.get('examiner_ids') || '').split(',').map(s => s.trim()).filter(Boolean)
		if (only.length) data = data.filter(d => only.includes(d.examiner_id))
		const scope = searchParams.get('scope') === 'all' ? 'all' : 'claimed'

		const [{ data: inst }, { data: sess }] = await Promise.all([
			supabase.from('institutions').select('name, institution_code').eq('id', institutionsId).maybeSingle(),
			supabase.from('examination_sessions').select('session_name, session_code').eq('id', sessionId).maybeSingle(),
		])
		const code = String((inst as any)?.institution_code || 'COE').replace(/[^A-Za-z0-9_-]+/g, '')
		const sessCode = String((sess as any)?.session_code || 'session').replace(/[^A-Za-z0-9_-]+/g, '_')

		if (format === 'pdf') {
			const claimedOnly = data
				.filter(d => d.claimed_count > 0)
				.map(d => ({ ...d, papers: d.papers.filter(p => CLAIMED.includes(p.claim_status)) }))
			const pdf = await generateClaimReportPdf({
				institution: { name: (inst as any)?.name || '', institution_code: (inst as any)?.institution_code || '' },
				session_name: (sess as any)?.session_name || (sess as any)?.session_code || '',
				examiners: claimedOnly.map(d => ({
					full_name: d.full_name,
					designation: d.designation,
					department: d.department,
					institution_name: d.institution_name,
					email: d.email,
					mobile: d.mobile,
					bank: d.bank,
					papers: d.papers.map(p => ({
						course_code: `${p.course_code || ''}${p.set_label ? ` (Set ${p.set_label})` : ''}`,
						title: p.subject_title || '',
						qp_amount: p.qp_amount,
						ak_amount: p.ak_amount,
					})),
				})),
			})
			await logAccess(req, {
				action: 'claim_report_download',
				institutions_id: institutionsId,
				performed_by_user_id: perm.userId || null,
				performed_by_email: perm.email || null,
				performed_by_role: 'coe',
				module: 'claim',
				detail: { format: 'pdf', examiners: claimedOnly.length, examination_session_id: sessionId },
			})
			return new NextResponse(new Uint8Array(pdf), {
				status: 200,
				headers: {
					'Content-Type': 'application/pdf',
					'Content-Disposition': `inline; filename="ConsolidatedClaimReport_${code}_${sessCode}.pdf"`,
					'Cache-Control': 'no-store, max-age=0',
				},
			})
		}

		const buffer = await buildWorkbook(
			data,
			{
				institution: (inst as any)?.name || '',
				session: `Examination session: ${(sess as any)?.session_name || (sess as any)?.session_code || ''}`,
			},
			scope
		)

		// The report carries bank account numbers — record who took it.
		await logAccess(req, {
			action: 'claim_report_download',
			institutions_id: institutionsId,
			performed_by_user_id: perm.userId || null,
			performed_by_email: perm.email || null,
			performed_by_role: 'coe',
			module: 'claim',
			detail: { scope, examiners: data.length, examination_session_id: sessionId },
		})

		return new NextResponse(new Uint8Array(buffer), {
			status: 200,
			headers: {
				'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
				'Content-Disposition': `attachment; filename="ExaminerClaimReport_${code}_${sessCode}.xlsx"`,
				'Cache-Control': 'no-store, max-age=0',
			},
		})
	} catch (error: any) {
		console.error('[QP claims] failed:', error)
		return NextResponse.json({ error: error?.message || 'Failed to load examiner claims' }, { status: 500 })
	}
}
