// Examiner workflow — version history for the question paper and the claim.
//
// A submission is never overwritten. Each one becomes a numbered version row
// (V1, V2 …) that keeps exactly what was submitted, by whom, from where and
// when. Reopening marks the current version 'reopened' with the authoriser's
// identity and reason; the next submission supersedes it and becomes current.
//
//   Submit → Lock → Authorised reopen (reason) → Edit → Resubmit → Lock
//
// Every function here is best-effort on the SNAPSHOT side only when told so:
// a submit must not fail because history could not be written, but a reopen
// must, because a reopen without a recorded reason is exactly what this
// module exists to prevent.

import type { SupabaseClient } from '@supabase/supabase-js'
import { isQuestionAuthored } from '@/lib/ia/sub-questions'

export interface Actor {
	userId?: string | null
	email?: string | null
	ip?: string | null
	userAgent?: string | null
}

export interface PaperVersionInput {
	assignmentId: string
	paperId: string
	institutionsId?: string | null
	examinerId?: string | null
	questions: unknown[]
	defaultFont?: string | null
	actor: Actor
}

export interface ClaimVersionInput {
	assignmentId: string
	institutionsId?: string | null
	examinerId?: string | null
	data: Record<string, unknown>
	actor: Actor
}

const done = (q: any) => isQuestionAuthored(q)

/** Supersede whatever version is current and insert the next one. */
export async function snapshotPaperVersion(
	supabase: SupabaseClient,
	input: PaperVersionInput
): Promise<{ version: number } | { error: string }> {
	const { data: last } = await supabase
		.from('ia_qp_paper_versions')
		.select('version')
		.eq('assignment_id', input.assignmentId)
		.order('version', { ascending: false })
		.limit(1)
		.maybeSingle()
	const version = (last?.version || 0) + 1

	await supabase
		.from('ia_qp_paper_versions')
		.update({ status: 'superseded' })
		.eq('assignment_id', input.assignmentId)
		.in('status', ['current', 'reopened'])

	const { error } = await supabase.from('ia_qp_paper_versions').insert({
		assignment_id: input.assignmentId,
		paper_id: input.paperId,
		institutions_id: input.institutionsId || null,
		version,
		status: 'current',
		questions: input.questions,
		default_font: input.defaultFont || null,
		question_total: input.questions.length,
		question_done: input.questions.filter(done).length,
		submitted_by_examiner_id: input.examinerId || null,
		submitted_ip: input.actor.ip || null,
		submitted_user_agent: input.actor.userAgent || null,
	})
	if (error) return { error: error.message }

	await supabase.from('ia_qp_assignments').update({ paper_version: version }).eq('id', input.assignmentId)
	return { version }
}

export async function snapshotClaimVersion(
	supabase: SupabaseClient,
	input: ClaimVersionInput
): Promise<{ version: number } | { error: string }> {
	const { data: last } = await supabase
		.from('ia_qp_claim_versions')
		.select('version')
		.eq('assignment_id', input.assignmentId)
		.order('version', { ascending: false })
		.limit(1)
		.maybeSingle()
	const version = (last?.version || 0) + 1

	await supabase
		.from('ia_qp_claim_versions')
		.update({ status: 'superseded' })
		.eq('assignment_id', input.assignmentId)
		.in('status', ['current', 'reopened'])

	const { error } = await supabase.from('ia_qp_claim_versions').insert({
		assignment_id: input.assignmentId,
		institutions_id: input.institutionsId || null,
		version,
		status: 'current',
		data: input.data,
		submitted_by_examiner_id: input.examinerId || null,
		submitted_ip: input.actor.ip || null,
		submitted_user_agent: input.actor.userAgent || null,
	})
	if (error) return { error: error.message }

	await supabase.from('ia_qp_assignments').update({ claim_version: version }).eq('id', input.assignmentId)
	return { version }
}

/**
 * Mark the current version of a paper / claim as reopened. The reason is
 * mandatory — a reopen with no reason is refused before anything changes.
 */
export async function markVersionReopened(
	supabase: SupabaseClient,
	table: 'ia_qp_paper_versions' | 'ia_qp_claim_versions',
	assignmentId: string,
	reopen: { reason: string; remarks?: string | null; actor: Actor; at: string }
): Promise<{ version: number | null } | { error: string }> {
	const reason = String(reopen.reason || '').trim()
	if (!reason) return { error: 'A reason for reopening is required.' }

	const { data: current } = await supabase
		.from(table)
		.select('id, version')
		.eq('assignment_id', assignmentId)
		.eq('status', 'current')
		.order('version', { ascending: false })
		.limit(1)
		.maybeSingle()

	// A submission that predates versioning has no row to mark; the reopen is
	// still recorded on the assignment and in the audit log by the caller.
	if (!current) return { version: null }

	const { error } = await supabase
		.from(table)
		.update({
			status: 'reopened',
			reopened_at: reopen.at,
			reopened_by: reopen.actor.userId || null,
			reopened_by_email: reopen.actor.email || null,
			reopen_reason: reason,
			reopen_remarks: reopen.remarks || null,
		})
		.eq('id', current.id)
	if (error) return { error: error.message }
	return { version: current.version }
}

// ── Compact question diff for the audit log ─────────────────────────────────

const plain = (v: unknown) =>
	String(v ?? '')
		.replace(/<[^>]*>/g, '')
		.replace(/&nbsp;/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()

const clip = (v: string, n = 240) => (v.length > n ? `${v.slice(0, n)}…` : v)

export interface QuestionChange {
	id: string
	label: string
	field:
		| 'question_text' | 'co_code' | 'k_level' | 'marks' | 'options' | 'sub_questions' | 'image'
		| 'answer_key' | 'answer_key_image'
	old: unknown
	new: unknown
}

/**
 * What changed between two question arrays, question by question, as small
 * old/new pairs. Rich text is flattened to plain text so the log stays
 * readable; a whole-array `sub_questions` or `options` change is recorded as
 * a JSON string of each side.
 */
export function diffQuestions(before: any[], after: any[]): QuestionChange[] {
	const byId = new Map<string, any>((before || []).map(q => [String(q?.id), q]))
	const out: QuestionChange[] = []
	for (const q of after || []) {
		const prev = byId.get(String(q?.id))
		if (!prev) continue
		const label = `Q${q.question_number ?? ''}${q.sub_label ? ` ${q.sub_label}` : ''}`
		const push = (field: QuestionChange['field'], o: unknown, n: unknown) =>
			out.push({ id: String(q.id), label, field, old: o, new: n })

		const ot = plain(prev.question_text)
		const nt = plain(q.question_text)
		if (ot !== nt) push('question_text', clip(ot), clip(nt))
		if ((prev.co_code || null) !== (q.co_code || null)) push('co_code', prev.co_code || null, q.co_code || null)
		if ((prev.k_level || null) !== (q.k_level || null)) push('k_level', prev.k_level || null, q.k_level || null)
		if ((prev.marks ?? null) !== (q.marks ?? null)) push('marks', prev.marks ?? null, q.marks ?? null)

		const oOpts = JSON.stringify((prev.options || []).map((o: any) => [o.key, plain(o.text_html ?? o.text)]))
		const nOpts = JSON.stringify((q.options || []).map((o: any) => [o.key, plain(o.text_html ?? o.text)]))
		if (oOpts !== nOpts) push('options', clip(oOpts), clip(nOpts))

		const oSubs = JSON.stringify(
			(prev.sub_questions || []).map((s: any) => [s.label, plain(s.question_text), s.marks, s.co_code, s.k_level])
		)
		const nSubs = JSON.stringify(
			(q.sub_questions || []).map((s: any) => [s.label, plain(s.question_text), s.marks, s.co_code, s.k_level])
		)
		if (oSubs !== nSubs) push('sub_questions', clip(oSubs), clip(nSubs))

		// Per-sub-division answer keys, logged as their own change.
		const oSubKeys = JSON.stringify(
			(prev.sub_questions || []).map((s: any) => [s.label, plain(s.answer_key), s.answer_key_image?.url || null])
		)
		const nSubKeys = JSON.stringify(
			(q.sub_questions || []).map((s: any) => [s.label, plain(s.answer_key), s.answer_key_image?.url || null])
		)
		if (oSubKeys !== nSubKeys) push('answer_key', clip(oSubKeys), clip(nSubKeys))

		if ((prev.image?.url || null) !== (q.image?.url || null)) push('image', prev.image?.url || null, q.image?.url || null)

		const oAk = plain(prev.answer_key)
		const nAk = plain(q.answer_key)
		if (oAk !== nAk) push('answer_key', clip(oAk), clip(nAk))
		if ((prev.answer_key_image?.url || null) !== (q.answer_key_image?.url || null)) {
			push('answer_key_image', prev.answer_key_image?.url || null, q.answer_key_image?.url || null)
		}
	}
	return out
}
