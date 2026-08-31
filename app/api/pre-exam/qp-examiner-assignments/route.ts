// Question Paper Examiner Assignment — list and create.
//
// GET  /api/pre-exam/qp-examiner-assignments   list, with filters
// POST /api/pre-exam/qp-examiner-assignments   assign a paper to an examiner
//
// Assignment is step TWO of the flow. The paper and its format are settled in
// the Generate step (/api/pre-exam/ese-question-papers) and this call only
// attaches an examiner to a paper that already exists — it never creates one.
//
// In order, so a half-made assignment is never left behind:
//   1. verify the session really is an End Semester examination (spec §4.2)
//   2. mirror an internal MyJKKN staff member into `examiners` if needed
//   3. load the ese_question_papers row and prove it belongs to this session
//   4. write the assignment and allocate its order reference

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { istLocalToIso, windowState } from '@/lib/qp-portal/ist'
import { getPortalContent } from '@/lib/qp-portal/content'
import { nextOrderRef } from '@/lib/qp-portal/assignment-service'
import { requireUserPermission } from '@/lib/auth/check-user-permission'
import { isEndSemesterExamType, endSemesterMismatchMessage } from '@/lib/qp-portal/exam-type'
import type { QpAssignmentCreateInput } from '@/types/qp-examiner-assignment'

export const dynamic = 'force-dynamic'

const VIEW_PERMISSION = 'page.pre_exam.qp_examiner_assignment.view'

// ── GET ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(req.url)
		const institutionsId = searchParams.get('institutions_id')
		const sessionId = searchParams.get('examination_session_id')
		const status = searchParams.get('status')
		const kind = searchParams.get('examiner_kind')
		const examinerId = searchParams.get('examiner_id')
		const programCode = searchParams.get('program_code')
		const semester = searchParams.get('semester')
		const search = (searchParams.get('search') || '').trim().toLowerCase()

		let query = supabase
			.from('ia_qp_assignments')
			.select('*')
			.order('assigned_at', { ascending: false })
			// created_at/assigned_at are not unique, so a paginated read without a
			// unique tiebreaker can duplicate or skip rows across pages.
			.order('id', { ascending: false })

		if (institutionsId) query = query.eq('institutions_id', institutionsId)
		if (sessionId) query = query.eq('examination_session_id', sessionId)
		if (status) query = query.eq('status', status)
		if (kind) query = query.eq('examiner_kind', kind)
		if (examinerId) query = query.eq('examiner_id', examinerId)
		if (programCode) query = query.eq('program_code', programCode)
		if (semester) query = query.eq('semester', Number(semester))

		const { data, error } = await query.range(0, 999)
		if (error) {
			console.error('[QP assign] list failed:', error.message)
			return NextResponse.json({ error: error.message }, { status: 500 })
		}

		const rows = data || []

		// Join the examiner, the session and the paper's authored flag.
		const examinerIds = [...new Set(rows.map(r => r.examiner_id).filter(Boolean))]
		const paperIds = [...new Set(rows.map(r => r.paper_id).filter(Boolean))]
		const sessionIds = [...new Set(rows.map(r => r.examination_session_id).filter(Boolean))]

		const examinerById = new Map<string, any>()
		for (let i = 0; i < examinerIds.length; i += 200) {
			const { data: ex } = await supabase
				.from('examiners')
				.select('id, full_name, email, mobile, designation, department, institution_name, is_internal')
				.in('id', examinerIds.slice(i, i + 200))
			for (const e of ex || []) examinerById.set(e.id, e)
		}

		const paperById = new Map<string, any>()
		for (let i = 0; i < paperIds.length; i += 200) {
			const { data: papers } = await supabase
				.from('ese_question_papers')
				.select('id, status, questions, max_marks')
				.in('id', paperIds.slice(i, i + 200))
			for (const p of papers || []) paperById.set(p.id, p)
		}

		const sessionById = new Map<string, any>()
		if (sessionIds.length) {
			const { data: sessions } = await supabase
				.from('examination_sessions')
				.select('id, session_name, session_code')
				.in('id', sessionIds)
			for (const s of sessions || []) sessionById.set(s.id, s)
		}

		const now = new Date()
		let enriched = rows.map(r => {
			const paper = paperById.get(r.paper_id)
			const questions = Array.isArray(paper?.questions) ? paper.questions : []
			return {
				...r,
				examiner: examinerById.get(r.examiner_id) || null,
				session_name: sessionById.get(r.examination_session_id)?.session_name || null,
				paper_status: paper?.status || null,
				max_marks: paper?.max_marks ?? null,
				authored: questions.some((q: any) => String(q?.question_text || '').trim() !== ''),
				authored_count: questions.filter((q: any) => String(q?.question_text || '').trim() !== '').length,
				question_count: questions.length,
				window_state: windowState(r.valid_from, r.valid_to, now),
			}
		})

		if (search) {
			enriched = enriched.filter(
				r =>
					r.course_code?.toLowerCase().includes(search) ||
					r.subject_title?.toLowerCase().includes(search) ||
					r.examiner?.full_name?.toLowerCase().includes(search) ||
					r.examiner?.email?.toLowerCase().includes(search) ||
					r.order_ref_no?.toLowerCase().includes(search)
			)
		}

		return NextResponse.json({ data: enriched, count: enriched.length })
	} catch (error) {
		console.error('[QP assign] GET failed:', error)
		return NextResponse.json({ error: 'Failed to load assignments' }, { status: 500 })
	}
}

// ── POST ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
	try {
		const perm = await requireUserPermission(VIEW_PERMISSION)
		if (!perm.ok) {
			return NextResponse.json({ error: perm.error }, { status: perm.status })
		}

		const supabase = getSupabaseServer()
		const body = (await req.json()) as QpAssignmentCreateInput

		const {
			institutions_id,
			examination_session_id,
			paper_id,
			examiner_kind,
			examiner_id,
			staff,
			remuneration,
			notes,
		} = body

		if (!institutions_id || !examination_session_id || !paper_id) {
			return NextResponse.json(
				{ error: 'institutions_id, examination_session_id and paper_id are required' },
				{ status: 400 }
			)
		}
		if (examiner_kind !== 'internal' && examiner_kind !== 'external') {
			return NextResponse.json({ error: 'examiner_kind must be internal or external' }, { status: 400 })
		}

		// ── Window ──────────────────────────────────────────────────────────
		const validFrom = istLocalToIso(body.valid_from)
		const validTo = istLocalToIso(body.valid_to)
		if (!validFrom || !validTo) {
			return NextResponse.json(
				{ error: 'Enter a valid Date From and Date To for the question paper access period.' },
				{ status: 400 }
			)
		}
		if (new Date(validTo) <= new Date(validFrom)) {
			return NextResponse.json({ error: 'Date To must be after Date From.' }, { status: 400 })
		}

		// ── 1. The session must be an End Semester examination ──────────────
		const { data: session, error: sessionErr } = await supabase
			.from('examination_sessions')
			.select('id, session_name, exam_type_id, institutions_id')
			.eq('id', examination_session_id)
			.maybeSingle()
		if (sessionErr || !session) {
			return NextResponse.json({ error: 'Examination session not found' }, { status: 404 })
		}

		const { data: examType } = session.exam_type_id
			? await supabase
					.from('exam_types')
					.select('id, examination_code, examination_name')
					.eq('id', session.exam_type_id)
					.maybeSingle()
			: { data: null }

		if (!isEndSemesterExamType(examType)) {
			return NextResponse.json(
				{ error: endSemesterMismatchMessage(session.session_name, examType) },
				{ status: 400 }
			)
		}

		// ── 2. Resolve the examiner (mirroring internal staff if needed) ─────
		let resolvedExaminerId = examiner_id || null

		const { data: institution } = await supabase
			.from('institutions')
			.select('id, name, institution_code')
			.eq('id', institutions_id)
			.maybeSingle()
		const institutionCode = body.institution_code || institution?.institution_code || null

		if (examiner_kind === 'internal') {
			if (!staff?.email || !staff.full_name) {
				return NextResponse.json(
					{ error: 'Internal examiner details (name and college e-mail) are required.' },
					{ status: 400 }
				)
			}
			const email = staff.email.toLowerCase().trim()

			// The e-mail is the portal sign-in key and is UNIQUE on examiners, so an
			// existing row is updated rather than duplicated.
			const { data: existing } = await supabase
				.from('examiners')
				.select('id')
				.eq('email', email)
				.maybeSingle()

			if (existing) {
				resolvedExaminerId = existing.id
				const { error: updErr } = await supabase
					.from('examiners')
					.update({
						is_internal: true,
						status: 'ACTIVE',
						myjkkn_staff_id: staff.myjkkn_staff_id || null,
						designation: staff.designation || null,
						department: staff.department || null,
						mobile: staff.mobile || null,
						institution_id: institutions_id,
						institution_code: institutionCode,
						updated_at: new Date().toISOString(),
					})
					.eq('id', existing.id)
				if (updErr) {
					console.error('[QP assign] internal examiner update failed:', updErr.message)
					return NextResponse.json({ error: updErr.message }, { status: 500 })
				}
			} else {
				const { data: created, error: insErr } = await supabase
					.from('examiners')
					.insert({
						full_name: staff.full_name,
						email,
						mobile: staff.mobile || null,
						designation: staff.designation || null,
						department: staff.department || null,
						// Their employing institution is this one — the Examiner Order
						// prints this line, so it must be the name, not the code.
						institution_name: institution?.name || null,
						is_internal: true,
						// An internal staff member is vouched for by the appointment
						// itself — no self-registration approval step applies.
						status: 'ACTIVE',
						email_verified: true,
						form_type: 'internal',
						myjkkn_staff_id: staff.myjkkn_staff_id || null,
						institution_id: institutions_id,
						institution_code: institutionCode,
						willingness_roles: ['Question Paper Setter'],
					})
					.select('id')
					.single()
				if (insErr || !created) {
					console.error('[QP assign] internal examiner create failed:', insErr?.message)
					return NextResponse.json(
						{ error: insErr?.message || 'Could not create the internal examiner record' },
						{ status: 500 }
					)
				}
				resolvedExaminerId = created.id
			}
		}

		if (!resolvedExaminerId) {
			return NextResponse.json({ error: 'Select an examiner to assign.' }, { status: 400 })
		}

		const { data: examiner } = await supabase
			.from('examiners')
			.select('id, full_name, email, status')
			.eq('id', resolvedExaminerId)
			.maybeSingle()
		if (!examiner) {
			return NextResponse.json({ error: 'The selected examiner no longer exists.' }, { status: 404 })
		}
		if (examiner.status !== 'ACTIVE') {
			return NextResponse.json(
				{ error: `${examiner.full_name} is ${examiner.status.toLowerCase()} in the examiner panel and cannot be assigned.` },
				{ status: 400 }
			)
		}

		// ── 3. The paper must already exist ─────────────────────────────────
		// The format is chosen in the Generate step, so by the time an examiner is
		// appointed the paper and its question skeleton are settled. Nothing is
		// created here.
		const { data: paper } = await supabase
			.from('ese_question_papers')
			.select('*')
			.eq('id', paper_id)
			.maybeSingle()
		if (!paper) {
			return NextResponse.json(
				{
					error:
						'That question paper no longer exists. Generate the paper for this subject before assigning an examiner.',
				},
				{ status: 404 }
			)
		}
		// A paper belonging to another session or institution must never be
		// assignable from here, however the id arrived.
		if (paper.examination_session_id !== examination_session_id || paper.institutions_id !== institutions_id) {
			return NextResponse.json(
				{ error: 'That question paper belongs to a different examination session.' },
				{ status: 400 }
			)
		}

		const paperId = paper.id as string
		const setLabel = paper.set_label as string | null
		const courseLabel = `${paper.course_code || 'This paper'}${setLabel ? ` (Set ${setLabel})` : ''}`

		// One paper, one examiner (ia_qp_assignments_paper_unique). A cancelled row
		// still holds the slot, so name that case rather than reporting a phantom
		// examiner the CoE can see is no longer assigned.
		const { data: clash } = await supabase
			.from('ia_qp_assignments')
			.select('id, examiner_id, status')
			.eq('paper_id', paperId)
			.maybeSingle()
		if (clash) {
			const { data: holder } = await supabase
				.from('examiners')
				.select('full_name')
				.eq('id', clash.examiner_id)
				.maybeSingle()
			return NextResponse.json(
				{
					error:
						clash.status === 'cancelled'
							? `${courseLabel} has a cancelled assignment on record. Remove it from the Assignments tab before appointing someone else.`
							: `${courseLabel} is already assigned to ${holder?.full_name || 'another examiner'}. Cancel that assignment first.`,
					assignment_id: clash.id,
				},
				{ status: 409 }
			)
		}

		// ── 4. The assignment + its order reference ─────────────────────────
		const orderContent = await getPortalContent(institutions_id, 'order', examination_session_id)
		const now = new Date().toISOString()

		const basePayload = {
			institutions_id,
			institution_code: institutionCode,
			examination_session_id,
			exam_type_id: examType?.id || null,
			examiner_id: resolvedExaminerId,
			examiner_kind,
			paper_id: paperId,
			// Copied from the paper, not re-derived: the assignment must describe
			// exactly the paper the order was issued for.
			template_id: paper.template_id,
			course_id: paper.course_id,
			course_code: paper.course_code,
			subject_title: paper.subject_title,
			program_code: paper.program_code,
			semester: paper.semester,
			set_label: setLabel,
			valid_from: validFrom,
			valid_to: validTo,
			status: 'assigned',
			// The rate is copied now so a later change to the portal content cannot
			// silently restate this examiner's claim.
			remuneration: remuneration ?? orderContent.rate_per_paper ?? null,
			notes: notes || null,
			assigned_by: perm.userId,
			assigned_at: now,
			order_issued_at: now,
		}

		// The order reference is allocated from a count, so two concurrent creates
		// can pick the same number. The unique index rejects the loser; retry once
		// with a freshly read count, then fall back to no reference rather than
		// failing the whole assignment.
		let inserted: any = null
		let lastError: string | null = null
		for (let attempt = 0; attempt < 2 && !inserted; attempt++) {
			const orderRef = await nextOrderRef(supabase, institutions_id, orderContent.letter_ref)
			const { data, error } = await supabase
				.from('ia_qp_assignments')
				.insert({ ...basePayload, order_ref_no: orderRef })
				.select()
				.single()
			if (data) inserted = data
			else {
				lastError = error?.message || null
				if (error?.code !== '23505') break
			}
		}
		if (!inserted) {
			const { data, error } = await supabase
				.from('ia_qp_assignments')
				.insert(basePayload)
				.select()
				.single()
			if (error || !data) {
				console.error('[QP assign] insert failed:', error?.message || lastError)
				return NextResponse.json(
					{ error: error?.message || lastError || 'Could not create the assignment' },
					{ status: 500 }
				)
			}
			inserted = data
		}

		return NextResponse.json(
			{
				success: true,
				data: { ...inserted, examiner, window_state: windowState(validFrom, validTo) },
				message: `${courseLabel} assigned to ${examiner.full_name}.`,
			},
			{ status: 201 }
		)
	} catch (error: any) {
		console.error('[QP assign] POST failed:', error)
		return NextResponse.json({ error: error?.message || 'Failed to create the assignment' }, { status: 500 })
	}
}
